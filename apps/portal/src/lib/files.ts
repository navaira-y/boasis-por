// The one adapter around FileReader (rule 12): a picked file as a data URL, so a logo can be
// kept in the mock without a file store. Rejects when the browser cannot read it.
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('The file could not be read'));
    };
    reader.readAsDataURL(file);
  });
}

// The adapter around a picked File (rule 12): its name, media type and size, the three things the
// upload checks and the vault record need. The file body stays in the browser until a backend
// stores it.
export interface PickedFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export function describeFile(file: File): PickedFile {
  return { name: file.name, type: file.type, size: file.size };
}
