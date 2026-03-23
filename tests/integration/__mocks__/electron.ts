export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from(text),
  decryptString: (buffer: Buffer) => buffer.toString(),
};

export default { safeStorage };
