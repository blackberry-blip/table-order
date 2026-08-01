import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export async function uploadFoodImage(file, itemName) {
  // Create unique filename: menu/burger_1699123456789.jpg
  const timestamp = Date.now();
  const safeName = (itemName || "food").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `menu/${safeName}_${timestamp}.jpg`;
  
  const storageRef = ref(storage, filename);
  
  // Upload the file
  const snapshot = await uploadBytes(storageRef, file);
  
  // Get permanent download URL
  const downloadURL = await getDownloadURL(snapshot.ref);
  
  return downloadURL;
}