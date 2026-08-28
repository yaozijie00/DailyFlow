export interface StoragePathsInput {
  dataDir: string;
  cacheDir: string;
  backupDir: string;
}

const ILLEGAL_CHARS = /[<>"|?*]/;

/** 校验三个存储路径；空串表示用默认值。返回 { 字段: 错误信息 }。 */
export function validateStoragePaths(input: StoragePathsInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["dataDir", "cacheDir", "backupDir"] as const) {
    const v = input[key].trim();
    if (v === "") continue;
    const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(v) || v.startsWith("\\\\");
    if (!isWindowsAbsolute) {
      errors[key] = "必须是绝对路径（如 C:\\Users\\...）";
    } else if (ILLEGAL_CHARS.test(v)) {
      errors[key] = "路径包含非法字符";
    }
  }
  return errors;
}
