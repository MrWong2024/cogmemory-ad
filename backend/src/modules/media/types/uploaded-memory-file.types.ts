export type UploadedMemoryFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type MediaEvidenceUploadedFiles = {
  file?: UploadedMemoryFile[];
  trajectory?: UploadedMemoryFile[];
};
