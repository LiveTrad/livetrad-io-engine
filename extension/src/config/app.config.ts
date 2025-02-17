export interface AppConfig {
  debug: boolean;
  env: string;
}

export const defaultAppConfig: AppConfig = {
  debug: true,
  env: 'development'
};