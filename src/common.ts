export function parseFileContents(fileContents: string) {
  const rows = fileContents.split('\n').map((line) => split_at_index(line, line.indexOf('=')));

  const ast = rows.map((row) => {
    if(row.length !== 2) return { key: row[0].trim(), value: [] };
    const [key, value] = row;
    return { key: key.trim(), value: value.split(',').map((v) => v.trim()) };
  });
  return ast;
}

export function split_at_index(value: string, index: number) {
  return [value.slice(0, index), (value.slice(index+1))];
}