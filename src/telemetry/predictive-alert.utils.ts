export type TemperaturePoint = {
  temperature: number;
  createdAt: Date;
};

export type PredictiveResult = {
  canPredict: boolean;
  currentTemperature: number;
  predictedMax: number;
  predictedMaxMinute: number;
  alertLevel: 0 | 2 | 3;
  thresholdToBeExceeded?: number;
  minutesToThreshold?: number;
  notificationMessage?: string;
  reason: string;
  coefficients?: {
    a: number;
    b: number;
    c: number;
  };
};

export function calculatePredictiveCurveAlert(
  points: TemperaturePoint[],
  threshold2: number,
  threshold3: number,
  horizonMinutes = 10,
): PredictiveResult {
  const MIN_POINTS = 6;
  const RECOMMENDED_POINTS = 10;
  const MIN_TEMP_TO_PREDICT = 100;
  const MARGIN = 3;
  const MAX_REASONABLE_INCREASE = 120;
  const MAX_REASONABLE_TEMP = 600;

  if (!points || points.length === 0) {
    return {
      canPredict: false,
      currentTemperature: 0,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'No hay datos de temperatura para predecir.',
    };
  }

  const orderedPoints = points
    .filter(p => p && typeof p.temperature === 'number' && !Number.isNaN(p.temperature))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const currentTemperature = orderedPoints[orderedPoints.length - 1]?.temperature ?? 0;

  if (currentTemperature < MIN_TEMP_TO_PREDICT) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'Predicción desactivada porque la temperatura actual es menor a 100°C.',
    };
  }

  if (orderedPoints.length < MIN_POINTS) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'No hay suficientes datos para calcular una predicción confiable.',
    };
  }

  const selectedPoints = orderedPoints.slice(-RECOMMENDED_POINTS);
  const n = selectedPoints.length;

  const data = selectedPoints.map((p, index) => ({
    t: index - (n - 1),
    y: p.temperature,
  }));

  let coefficients;

  try {
    coefficients = quadraticRegression(data);
  } catch (error) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'No se pudo resolver la regresión cuadrática.',
    };
  }

  const { a, b, c } = coefficients;

  const predict = (t: number): number => a * t * t + b * t + c;

  let predictedMax = predict(0);
  let predictedMaxMinute = 0;

  for (let minute = 0; minute <= horizonMinutes; minute++) {
    const value = predict(minute);

    if (value > predictedMax) {
      predictedMax = value;
      predictedMaxMinute = minute;
    }
  }

  if (a < 0) {
    const vertexMinute = -b / (2 * a);

    if (vertexMinute >= 0 && vertexMinute <= horizonMinutes) {
      const vertexTemperature = predict(vertexMinute);

      if (vertexTemperature > predictedMax) {
        predictedMax = vertexTemperature;
        predictedMaxMinute = vertexMinute;
      }
    }
  }

  if (
    Number.isNaN(predictedMax) ||
    predictedMax < 0 ||
    predictedMax > MAX_REASONABLE_TEMP ||
    predictedMax > currentTemperature + MAX_REASONABLE_INCREASE
  ) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax,
      predictedMaxMinute,
      alertLevel: 0,
      reason: 'Predicción descartada por entregar un valor fuera de rango razonable.',
      coefficients: { a, b, c },
    };
  }

  let alertLevel: 0 | 2 | 3 = 0;
  let reason = 'La predicción no supera los umbrales dentro de los próximos 10 minutos.';
  let thresholdToBeExceeded: number | undefined = undefined;
  let minutesToThreshold: number | undefined = undefined;
  let notificationMessage: string | undefined = undefined;

  // Determine if it crosses threshold_3 first, else threshold_2
  let targetThreshold: number | undefined = undefined;
  if (predictedMax >= threshold3 + MARGIN) {
    alertLevel = 3;
    targetThreshold = threshold3;
  } else if (predictedMax >= threshold2 + MARGIN) {
    alertLevel = 2;
    targetThreshold = threshold2;
  }

  if (targetThreshold !== undefined) {
    // Find the exact minute it crosses
    for (let minute = 0; minute <= horizonMinutes; minute++) {
      const value = predict(minute);
      if (value >= targetThreshold) {
        minutesToThreshold = minute;
        break;
      }
    }

    if (minutesToThreshold !== undefined) {
      thresholdToBeExceeded = targetThreshold;
      notificationMessage = `La T° superará el umbral de ${targetThreshold}°C en ${minutesToThreshold} min.`;
      reason = `La predicción indica que podría superar el umbral ${targetThreshold}°C en aproximadamente ${minutesToThreshold} minutos.`;
    } else {
      // It didn't cross within 10 minutes according to integer minutes check, maybe between minutes.
      // Or we only reached it on the vertex and the vertex is not an integer.
      // We can fallback to predictedMaxMinute
      minutesToThreshold = Math.round(predictedMaxMinute);
      thresholdToBeExceeded = targetThreshold;
      notificationMessage = `La T° superará el umbral de ${targetThreshold}°C en ${minutesToThreshold} min.`;
      reason = `La predicción indica que podría superar el umbral ${targetThreshold}°C en aproximadamente ${minutesToThreshold} minutos.`;
    }
  } else {
    // Reset alertLevel if targetThreshold is undefined
    alertLevel = 0;
  }

  return {
    canPredict: true,
    currentTemperature,
    predictedMax: Number(predictedMax.toFixed(2)),
    predictedMaxMinute: Number(predictedMaxMinute.toFixed(1)),
    alertLevel,
    thresholdToBeExceeded,
    minutesToThreshold,
    notificationMessage,
    reason,
    coefficients: {
      a,
      b,
      c,
    },
  };
}

function quadraticRegression(data: { t: number; y: number }[]) {
  const n = data.length;

  let sumX = 0;
  let sumX2 = 0;
  let sumX3 = 0;
  let sumX4 = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2Y = 0;

  for (const point of data) {
    const x = point.t;
    const y = point.y;

    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x2 * x2;

    sumX += x;
    sumX2 += x2;
    sumX3 += x3;
    sumX4 += x4;
    sumY += y;
    sumXY += x * y;
    sumX2Y += x2 * y;
  }

  const matrix = [
    [n, sumX, sumX2],
    [sumX, sumX2, sumX3],
    [sumX2, sumX3, sumX4],
  ];

  const vector = [sumY, sumXY, sumX2Y];

  const [c, b, a] = solve3x3(matrix, vector);

  return { a, b, c };
}

function solve3x3(matrix: number[][], vector: number[]) {
  const m = matrix.map((row, i) => [...row, vector[i]]);

  for (let i = 0; i < 3; i++) {
    let maxRow = i;

    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(m[k][i]) > Math.abs(m[maxRow][i])) {
        maxRow = k;
      }
    }

    [m[i], m[maxRow]] = [m[maxRow], m[i]];

    const pivot = m[i][i];

    if (Math.abs(pivot) < 1e-10) {
      throw new Error('No se pudo resolver la regresión cuadrática.');
    }

    for (let j = i; j < 4; j++) {
      m[i][j] /= pivot;
    }

    for (let k = 0; k < 3; k++) {
      if (k !== i) {
        const factor = m[k][i];

        for (let j = i; j < 4; j++) {
          m[k][j] -= factor * m[i][j];
        }
      }
    }
  }

  return [m[0][3], m[1][3], m[2][3]];
}
