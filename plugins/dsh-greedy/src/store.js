import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function write(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const target = exclusive ? file : file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(target, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  if (!exclusive) fs.renameSync(target, file);
}
export function append(file, value) {
  const fd = fs.openSync(file, 'a');
  try { fs.writeFileSync(fd, JSON.stringify(value)+'\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
