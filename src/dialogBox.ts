let dialogBox: DialogBox | undefined;

export function getDialogBox() {
  if (!dialogBox) {
    dialogBox = new DialogBox();
  }
  return dialogBox;
}

export interface DialogMessage {
  message: string;
  characterStagger: number; // how many frames does displaying each character take?
}

class MessageTicker {
  #message: string;
  #characterStagger: number;

  #charCount: number;
  #timeUntilNextChar: number;

  constructor({ message, characterStagger: speed }: DialogMessage) {
    this.#message = message;
    this.#characterStagger = speed;
    this.#charCount = 0;
    this.#timeUntilNextChar = speed;
  }

  update(): string | undefined {
    this.#timeUntilNextChar -= 1;
    if (this.#timeUntilNextChar === 0) {
      this.#timeUntilNextChar = this.#characterStagger;
      this.#charCount += 1;
    }

    if (this.#charCount > this.#message.length) {
      return undefined;
    }
    return this.#message.slice(0, this.#charCount);
  }
}

class DialogBox {
  #messageQueue: MessageTicker[];

  constructor() {
    this.#messageQueue = [];
  }

  enqueueMessage(message: DialogMessage) {
    this.#messageQueue.push(new MessageTicker(message));
  }

  #tickAndGetCurrentMessage(): string | undefined {
    const ticker = this.#messageQueue[0];
    if (!ticker) {
      return undefined;
    }

    const result = ticker.update();
    if (result === undefined) {
      this.#messageQueue = this.#messageQueue.slice(1);
      return "";
    }
    return result;
  }

  update() {
    const dialogElement = document.getElementById("dialogBox");
    if (!dialogElement) {
      throw new Error("Dialog box not found!");
    }
    const opacity = Number.parseFloat(window.getComputedStyle(dialogElement).opacity);

    if (opacity < 1 && dialogElement.dataset.state === "visible") {
      // currently fading in
      // spaghetti, but oh well.
      return;
    }

    const message = this.#tickAndGetCurrentMessage();
    if (message === undefined) {
      dialogElement.dataset.state = "hidden";
      return;
    }
    dialogElement.dataset.state = "visible";
    dialogElement.innerText = message + "\u00A0";
  }
}
