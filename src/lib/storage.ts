import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Inisialisasi Firebase Storage
const storage = getStorage();

/**
 * Mengunggah file ke Firebase Storage dan mengembalikan URL unduhnya.
 * @param file File yang akan diunggah.
 * @param path Path di mana file akan disimpan di Storage (mis. 'settings/logo.png').
 * @returns Promise yang resolve dengan URL unduh file.
 */
export const uploadFile = async (file: File, path: string): Promise<{ downloadURL: string }> => {
  if (!file) {
    throw new Error('File tidak ditemukan untuk diunggah.');
  }

  const storageRef = ref(storage, path);

  try {
    // 1. Unggah file
    const snapshot = await uploadBytes(storageRef, file);
    console.log('Berhasil mengunggah file:', snapshot.metadata.fullPath);

    // 2. Dapatkan URL unduh
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('URL unduh file:', downloadURL);

    return { downloadURL };

  } catch (error) {
    console.error("Gagal mengunggah file:", error);
    // Kita re-throw error agar bisa ditangani oleh fungsi pemanggil (mis. handleSave)
    throw error; 
  }
};
