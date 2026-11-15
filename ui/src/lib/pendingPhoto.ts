import type { UploadFile } from "./api";

// Keep the selected photo only in memory while an upload is in progress. This
// lets the user resume after signing in again without persisting photo URIs.
let pendingPhoto: UploadFile | null = null;

export function setPendingPhoto(photo: UploadFile) {
  pendingPhoto = photo;
}

export function getPendingPhoto() {
  return pendingPhoto;
}

export function clearPendingPhoto() {
  pendingPhoto = null;
}
