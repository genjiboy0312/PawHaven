/** Frame the clean Pixi scene as a downloadable PNG. */
export async function postcardPng(photo: HTMLCanvasElement, title: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const border = 28;
  canvas.width = photo.width + border * 2;
  canvas.height = photo.height + border * 2 + 42;
  const context = canvas.getContext('2d');
  if (!context) throw Error('postcard_canvas_unavailable');

  context.fillStyle = '#fff5dc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c9a87c';
  context.lineWidth = 2;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.imageSmoothingEnabled = false;
  context.drawImage(photo, border, border);
  context.fillStyle = '#654a35';
  context.font = '24px Jua, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title, canvas.width / 2, photo.height + border + 32, canvas.width - border * 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('postcard_png_unavailable')), 'image/png');
  });
}
