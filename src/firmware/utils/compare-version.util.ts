/**
 * Compara dos versiones semánticas numéricamente por segmentos.
 * e.g., "1.0.3", "1.1.0", "2.0.0"
 * No hace comparación de strings.
 * 
 * Casos de prueba soportados y validados:
 * - 1.0.1 < 1.0.2     -> retorna -1
 * - 1.0.9 < 1.0.10    -> retorna -1
 * - 1.1.0 > 1.0.99    -> retorna 1
 * - 2.0.0 > 1.9.9     -> retorna 1
 * - 1.0 == 1.0.0      -> retorna 0
 * - 1 == 1.0.0        -> retorna 0
 * 
 * @returns 1 si v1 > v2, -1 si v1 < v2, 0 si son iguales
 */
export function compareVersion(v1: string, v2: string): number {
  if (!v1) return -1;
  if (!v2) return 1;
  
  // Transformar string a arreglos numéricos ('1.0.10' -> [1, 0, 10])
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);
  const len = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < len; i++) {
    // Valida contra 0 si el segmento no existe (ej: 1.0 vs 1.0.0)
    const val1 = v1Parts[i] || 0;
    const val2 = v2Parts[i] || 0;
    
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  
  return 0;
}
