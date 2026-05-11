export const Role = {
  ADMIN: 'ADMIN',
  COLLABORATOR: 'COLLABORATOR'
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const NodeType = {
  DATA_INGESTION: 'DATA_INGESTION',
  PREPROCESSING: 'PREPROCESSING',
  DATASET_SPLIT: 'DATASET_SPLIT',
  TRAINING: 'TRAINING',
  DEPLOYMENT: 'DEPLOYMENT'
} as const;
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface User {
  idUser: number;
  username: string;
  role: Role;
  name: string;
  email: string;
}

export interface PipelineNode {
  idNode: number;
  nodeType: NodeType;
  orderIndex: number;
  configJson: string; 
}

export interface Workspace {
  idWorkspace: number;
  name: string;
  description: string;
  owner: User;
}