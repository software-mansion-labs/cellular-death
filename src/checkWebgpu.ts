export function isWebGPUSupported(): boolean {
  return (
    navigator.gpu !== undefined &&
    typeof navigator.gpu.requestAdapter === 'function'
  );
}

export function showWebGPUErrorModal(): void {
  const errorModal = document.getElementById('webgpuErrorModal');
  if (errorModal) {
    errorModal.style.display = 'flex'; // from 'none' to 'flex'
  }
}
