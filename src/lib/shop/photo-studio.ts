/** Local-only product photography preparation; never sends the original image to another service. */
export async function prepareProductPhoto(file: File, removeBackdrop: boolean, zoom = 100) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPG or WebP under 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 10000 || bitmap.height > 10000)
      throw new Error("Use an image no larger than 10,000 pixels on either side.");
    const source = document.createElement("canvas");
    const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    source.width = Math.max(1, Math.round(bitmap.width * ratio));
    source.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = source.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Photo studio is unavailable in this browser.");
    ctx.drawImage(bitmap, 0, 0, source.width, source.height);
    const pixels = ctx.getImageData(0, 0, source.width, source.height),
      d = pixels.data,
      w = source.width,
      h = source.height;
    if (removeBackdrop && d[3] > 0) {
      const color = [d[0], d[1], d[2]],
        matches = (i: number) =>
          d[i + 3] < 8 ||
          Math.max(
            Math.abs(d[i] - color[0]),
            Math.abs(d[i + 1] - color[1]),
            Math.abs(d[i + 2] - color[2]),
          ) <= 28;
      const corners = [0, w - 1, (h - 1) * w, h * w - 1];
      if (!corners.every((n) => matches(n * 4)))
        throw new Error(
          "This background is not a single flat color. Use a transparent product cutout or turn off backdrop removal and review the result.",
        );
      const seen = new Uint8Array(w * h),
        queue = new Int32Array(w * h);
      let head = 0,
        tail = 0;
      const visit = (n: number) => {
        if (n >= 0 && n < w * h && !seen[n] && matches(n * 4)) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      };
      for (let x = 0; x < w; x++) {
        visit(x);
        visit((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        visit(y * w);
        visit(y * w + w - 1);
      }
      while (head < tail) {
        const n = queue[head++];
        d[n * 4 + 3] = 0;
        if (n % w) visit(n - 1);
        if (n % w < w - 1) visit(n + 1);
        visit(n - w);
        visit(n + w);
      }
      ctx.putImageData(pixels, 0, 0);
    }
    let left = w,
      top = h,
      right = -1,
      bottom = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 12) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    if (right < left || bottom < top)
      throw new Error(
        "No product remains. Turn off background removal or use a transparent cutout.",
      );
    const output = document.createElement("canvas");
    output.width = 1000;
    output.height = 1000;
    const out = output.getContext("2d");
    if (!out) throw new Error("Photo studio is unavailable.");
    out.fillStyle = "#f4f6f8";
    out.fillRect(0, 0, 1000, 1000);
    const cw = right - left + 1,
      ch = bottom - top + 1,
      fit = (840 * Math.max(65, Math.min(100, zoom))) / 100 / Math.max(cw, ch);
    out.drawImage(
      source,
      left,
      top,
      cw,
      ch,
      (1000 - cw * fit) / 2,
      (1000 - ch * fit) / 2,
      cw * fit,
      ch * fit,
    );
    const data = output.toDataURL("image/png");
    if (data.length > 2800000)
      throw new Error(
        "The prepared photo is too detailed. Use a simpler product cutout under 2 MB.",
      );
    return data;
  } finally {
    bitmap.close();
  }
}
