export type InputFile = {
  id: string;
  execution: string;
  file_key: string;
  original_filename: string;
  uploaded_file: string;
  file_size: number;
  status: "UPLOADED" | "VALIDATED" | "INVALID";
  validation_errors: string[];
  uploaded_at: string;
  uploaded_by?: number;
};