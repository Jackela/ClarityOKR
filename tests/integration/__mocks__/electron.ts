export const safeStorage = {
  isEncryptionAvailable: () => true,
  isAsyncEncryptionAvailable: async () => true,
  encryptString: (text: string) => Buffer.from(text),
  decryptString: (buffer: Buffer) => buffer.toString(),
  encryptStringAsync: async (text: string) => Buffer.from(text),
  decryptStringAsync: async (buffer: Buffer) => ({
    result: buffer.toString(),
    shouldReEncrypt: false,
  }),
};

export default { safeStorage };
