import type { World } from 'koota';
import * as wf from 'wayfare';

let dialogBox: DialogBox | undefined;

export function getDialogBox() {
  if (!dialogBox) {
    dialogBox = new DialogBox();
  }
  return dialogBox;
}

export interface DialogMessage {
  message: string;
  /**
   * How many seconds does displaying each character take
   */
  characterStagger: number;
  onAppear?: () => void;
}

class MessageTicker {
  #message: DialogMessage;
  #characterStagger: number;

  #charCount: number;
  #timeUntilNextChar: number;

  constructor(message: DialogMessage) {
    this.#message = message;
    this.#characterStagger = message.characterStagger;
    this.#charCount = 0;
    this.#timeUntilNextChar = message.characterStagger;
  }

  init() {
    this.#message.onAppear?.();
  }

  update(deltaTime: number): string | undefined {
    this.#timeUntilNextChar -= deltaTime;
    if (this.#timeUntilNextChar <= 0) {
      this.#timeUntilNextChar = this.#characterStagger;
      this.#charCount += 1;
    }

    if (this.#charCount > this.#message.message.length) {
      return undefined;
    }
    return this.#message.message.slice(0, this.#charCount);
  }
}

class DialogBox {
  #messageQueue: MessageTicker[];

  constructor() {
    this.#messageQueue = [];
  }

  enqueueMessage(...messages: DialogMessage[]) {
    const firstMessage = this.#messageQueue.length === 0;
    this.#messageQueue.push(...messages.map((m) => new MessageTicker(m)));

    if (firstMessage) {
      this.#messageQueue[0].init();
    }
  }

  #tickAndGetCurrentMessage(deltaTime: number): string | undefined {
    const ticker = this.#messageQueue[0];
    if (!ticker) {
      return undefined;
    }

    const result = ticker.update(deltaTime);
    if (result === undefined) {
      this.#messageQueue = this.#messageQueue.slice(1);
      this.#messageQueue[0]?.init();

      return '';
    }
    return result;
  }

  update(world: World) {
    const time = wf.getOrThrow(world, wf.Time);

    const dialogElement = document.getElementById('dialogBox');
    if (!dialogElement) {
      throw new Error('Dialog box not found!');
    }
    const opacity = Number.parseFloat(
      window.getComputedStyle(dialogElement).opacity,
    );

    if (opacity < 1 && dialogElement.dataset.state === 'visible') {
      // currently fading in
      // spaghetti, but oh well.
      return;
    }

    const message = this.#tickAndGetCurrentMessage(time.deltaSeconds);
    if (message === undefined) {
      dialogElement.dataset.state = 'hidden';
      return;
    }
    dialogElement.dataset.state = 'visible';
    dialogElement.innerText = `${message.replaceAll('_', '')}\u00A0`;
  }
}
