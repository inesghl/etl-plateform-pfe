// types/group.ts
export type UserGroup = {
  id: string;
  name: string;
  description: string;
  members: import("./user").User[];
  member_count: number;
  created_by: number | null;
  created_at: string;
};

// types/etl.ts  (replace existing)
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

  entry_point_path: string;
  config_file_path: string;
  requirements_path: string;
  python_version: string;

  is_active: boolean;
  is_validated: boolean;
  is_restricted: boolean;
  validation_errors: string[];
  config?: EtlConfig;
  allowed_groups: import("./group").UserGroup[];
  created_by?: number;
  created_at: string;
  updated_at: string;
};