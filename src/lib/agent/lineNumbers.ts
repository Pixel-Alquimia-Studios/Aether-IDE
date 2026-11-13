// Numeración de líneas para las lecturas de los subagentes de solo lectura
// (0.4.1-B). Módulo puro y sin dependencias — testeable con Node directo.
//
// Los subagentes reciben el contenido numerado como "NNN| código" para que
// citen la línea EXACTA en sus hallazgos (antes la estimaban contando desde
// start_line y se equivocaban). El Modo Agente recibe el contenido CRUDO:
// nunca ve números que luego podría reescribir en un archivo.

/**
 * Quita el BOM de la primera línea (solo en lo que ve el subagente; el
 * archivo original no se toca).
 */
export function stripBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content
}

/**
 * Numera las líneas de `content` con el formato "NNN| línea", donde NNN va
 * relleno con espacios al ancho de `totalLines` (alineación estable).
 *
 * - `startLine` es el número REAL de la primera línea del contenido (con
 *   start_line/end_line de read_file_range, Rust entrega el rango exacto).
 * - El BOM (\uFEFF) se quita de la línea 1 solo en la salida.
 * - Los números coinciden con los del editor (Monaco): misma convención 1-based
 *   y `\r\n` ya normalizado a `\n` por Rust.
 */
export function numberLines(
  content: string,
  startLine: number,
  totalLines: number,
): string {
  const width = String(Math.max(totalLines, 1)).length
  // Normaliza \r\n (read_file completo conserva los \r; read_file_range ya
  // los quita en Rust) para que la numeración coincida con Monaco en ambos
  const clean = stripBom(content).replace(/\r\n/g, '\n')
  return clean
    .split('\n')
    .map((line, i) => `${String(startLine + i).padStart(width, ' ')}| ${line}`)
    .join('\n')
}
