// Upload image to Cloudinary from browser (unsigned, no secret needed)
export async function uploadToCloudinary(file) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME; // ngg0a8rt
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary config missing. Check env vars.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  return data.secure_url;
}