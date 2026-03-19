export type OutputFile = {
  id: string;
  execution: string;
  filename: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
  download_count: number;
  last_downloaded_at?: string;
};