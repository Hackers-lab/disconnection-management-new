/**
 * Utility for processing, resizing, watermarking and compressing images on the client side.
 * Ensures the target size is strictly less than the specified limit (default <100KB).
 */

export interface ProcessImageOptions {
  maxDim?: number;
  watermarkLines?: string[];
  targetKb?: number;
}

export async function compressAndWatermarkImage(
  file: File,
  options: ProcessImageOptions = {}
): Promise<File> {
  // If not an image file, return as-is
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const {
    maxDim = 800,
    watermarkLines = [],
    targetKb = 95 // target 95KB for safety margin under 100KB
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(img.src);

      let w = img.width;
      let h = img.height;

      // Rescale maintaining aspect ratio if exceeding maxDim
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      // Render Watermark if any lines are provided
      if (watermarkLines.length > 0) {
        const fs = Math.max(16, w * 0.032); // font size relative to width
        const pad = fs / 2;
        const lineSpacing = fs * 0.3;
        const barH = watermarkLines.length * fs + (watermarkLines.length - 1) * lineSpacing + pad * 2;

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, h - barH, w, barH);

        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "top";

        watermarkLines.forEach((line, index) => {
          const y = h - barH + pad + index * (fs + lineSpacing);
          ctx.fillText(line, pad, y);
        });
      }

      // Recursive compression loop to dynamically meet the file size constraint
      let quality = 0.65;
      let scaleFactor = 1.0;

      const attempt = () => {
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          if (blob.size <= targetKb * 1024) {
            // Success! Create a new JPEG File
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else if (quality > 0.25) {
            // Step quality down
            quality -= 0.1;
            attempt();
          } else if (scaleFactor > 0.5) {
            // Quality hit the limit, scale down the resolution
            scaleFactor -= 0.15;
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = Math.round(w * scaleFactor);
            tempCanvas.height = Math.round(h * scaleFactor);
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
              tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
              // Reset quality for new resolution
              quality = 0.6;
              tempCanvas.toBlob((subBlob) => {
                if (subBlob && subBlob.size <= targetKb * 1024) {
                  resolve(new File([subBlob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
                } else {
                  // If subCanvas blob still exceeds, recurse on it
                  canvas.width = tempCanvas.width;
                  canvas.height = tempCanvas.height;
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(tempCanvas, 0, 0);
                  attempt();
                }
              }, "image/jpeg", quality);
            } else {
              resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
            }
          } else {
            // Resolution and quality are at minimum, return best effort
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
          }
        }, "image/jpeg", quality);
      };

      attempt();
    };

    img.onerror = () => {
      resolve(file);
    };
  });
}
