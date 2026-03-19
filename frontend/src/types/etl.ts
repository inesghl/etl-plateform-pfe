export type InputSpec = {
  required?: boolean;
  extensions?: string[];
  description?: string;
  type?: string;
};

export type EtlConfig = {
  entry_point?: string;
  python_version?: string;
  input_requirements?: Record<string, InputSpec>;
  expected_outputs?: string[];
  [key: string]: any;
};

export type Etl = {
  id: string;
  name: string;
  description: string;
  version: string;
  zip_file?: string;
  is_active: boolean;
  is_validated: boolean;
  validation_errors: string[];
  config?: EtlConfig;
  created_by?: number;
  created_at: string;
  updated_at: string;
};