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
  slope?: number;
};

export function calculateLinearRegressionSlopeCPerMinute(points: TemperaturePoint[]): number | null {
  if (!points || points.length < 4) {
    return null;
  }

  const firstTime = new Date(points[0].createdAt).getTime();

  const values = points
    .map((p) => ({
      x: (new Date(p.createdAt).getTime() - firstTime) / 60000,
      y: Number(p.temperature),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (values.length < 4) {
    return null;
  }

  const totalMinutes = values[values.length - 1].x - values[0].x;

  if (totalMinutes < 3) {
    return null;
  }

  const n = values.length;
  const sumX = values.reduce((sum, p) => sum + p.x, 0);
  const sumY = values.reduce((sum, p) => sum + p.y, 0);
  const sumXY = values.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = values.reduce((sum, p) => sum + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;

  if (!Number.isFinite(slope)) {
    return null;
  }

  return slope;
}

function calculateDiffTempTrend(points: TemperaturePoint[]): 0 | 1 | 2 | 3 | 4 {
  if (!points || points.length < 4) {
    return 1;
  }

  const orderedPoints = [...points].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const lastLogs = [...orderedPoints].reverse().slice(0, 4);

  if (lastLogs.length < 2) {
    return 1;
  }

  const count = Math.min(2, Math.floor(lastLogs.length / 2));
  const recentLogs = lastLogs.slice(0, count);
  const olderLogs = lastLogs.slice(count, count * 2);

  const recentAvg =
    recentLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;

  const olderAvg =
    olderLogs.reduce((sum, log) => sum + Number(log.temperature), 0) / count;

  const diff = recentAvg - olderAvg;

  if (diff < -1) return 0;      // Bajando
  if (diff <= 1) return 1;      // Estable
  if (diff <= 3) return 2;      // Subiendo normal
  if (diff <= 6) return 3;      // Subiendo acelerada
  return 4;                     // Subiendo peligrosa
}

function shouldBlockByLastTemperatureDiff(points: TemperaturePoint[]): {
  block: boolean;
  reason?: string;
} {
  if (!points || points.length < 4) {
    return {
      block: true,
      reason: 'Predicción desactivada: faltan datos para validar cambios recientes de temperatura.',
    };
  }

  const orderedPoints = [...points].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const diffs: number[] = [];

  for (let i = 1; i < orderedPoints.length; i++) {
    const prevTemp = Number(orderedPoints[i - 1].temperature);
    const currentTemp = Number(orderedPoints[i].temperature);
    const diff = currentTemp - prevTemp;

    if (Number.isFinite(diff)) {
      diffs.push(diff);
    }
  }

  if (diffs.length < 3) {
    return {
      block: true,
      reason: 'Predicción desactivada: no hay suficientes diferencias de temperatura para validar tendencia.',
    };
  }

  const lastDiff = diffs[diffs.length - 1];
  const previousDiffs = diffs.slice(0, -1);

  const maxPreviousDiff = Math.max(...previousDiffs);
  const avgPreviousDiff =
    previousDiffs.reduce((sum, diff) => sum + diff, 0) / previousDiffs.length;

  if (lastDiff <= 0) {
    return {
      block: true,
      reason: `Predicción desactivada: la última diferencia indica baja o estabilidad (${lastDiff.toFixed(2)}°C).`,
    };
  }

  if (maxPreviousDiff > 0 && lastDiff < maxPreviousDiff * 0.35) {
    return {
      block: true,
      reason: `Predicción desactivada: la última subida perdió fuerza (${lastDiff.toFixed(2)}°C vs máximo previo ${maxPreviousDiff.toFixed(2)}°C).`,
    };
  }

  if (avgPreviousDiff > 0 && lastDiff < avgPreviousDiff * 0.5) {
    return {
      block: true,
      reason: `Predicción desactivada: la última subida es mucho menor al promedio anterior (${lastDiff.toFixed(2)}°C vs promedio ${avgPreviousDiff.toFixed(2)}°C).`,
    };
  }

  return {
    block: false,
  };
}

export function shouldCreatePredictiveAlert({
  currentTemperature,
  threshold,
  slopeCPerMinute,
  predictionWindowMinutes = 10,
}: {
  currentTemperature: number;
  threshold: number;
  slopeCPerMinute: number;
  predictionWindowMinutes?: number;
}): boolean {
  if (!Number.isFinite(currentTemperature)) return false;
  if (!Number.isFinite(threshold)) return false;
  if (!Number.isFinite(slopeCPerMinute)) return false;

  if (currentTemperature >= threshold) {
    return false;
  }

  if (slopeCPerMinute <= 0) {
    return false;
  }

  const predictedTemperature = currentTemperature + slopeCPerMinute * predictionWindowMinutes;
  const minutesToThreshold = (threshold - currentTemperature) / slopeCPerMinute;

  return (
    predictedTemperature >= threshold &&
    minutesToThreshold > 0 &&
    minutesToThreshold <= predictionWindowMinutes
  );
}

export function calculatePredictiveCurveAlert(
  points: TemperaturePoint[],
  threshold2: number,
  threshold3: number,
  horizonMinutes = 10,
): PredictiveResult {
  const MIN_TEMP_TO_PREDICT = 200;

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

  const validPoints = points
    .filter((p) => {
      const temp = Number(p?.temperature);
      const time = new Date(p?.createdAt).getTime();
      return Number.isFinite(temp) && Number.isFinite(time);
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (validPoints.length === 0) {
    return {
      canPredict: false,
      currentTemperature: 0,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'No hay datos válidos de temperatura para predecir.',
    };
  }

  const latestTime = new Date(validPoints[validPoints.length - 1].createdAt).getTime();
  const windowStartTime = latestTime - 10 * 60 * 1000;

  const selectedPoints = validPoints
    .filter((p) => new Date(p.createdAt).getTime() >= windowStartTime)
    .slice(-10);

  const currentTemperature = Number(selectedPoints[selectedPoints.length - 1]?.temperature ?? 0);

  if (currentTemperature < MIN_TEMP_TO_PREDICT) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'Predicción desactivada porque la temperatura actual es menor a 200°C.',
    };
  }

  const diffTempTrend = calculateDiffTempTrend(selectedPoints);

  if (diffTempTrend < 3) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: `Predicción desactivada: tendencia diffTemp=${diffTempTrend}. Solo se predice con tendencia 3 o 4.`,
    };
  }

  const lastDiffValidation = shouldBlockByLastTemperatureDiff(selectedPoints);

  if (lastDiffValidation.block) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: lastDiffValidation.reason || 'Predicción desactivada por validación de última diferencia de temperatura.',
    };
  }

  let slope = calculateLinearRegressionSlopeCPerMinute(selectedPoints);

  if (slope === null) {
    return {
      canPredict: false,
      currentTemperature,
      predictedMax: 0,
      predictedMaxMinute: 0,
      alertLevel: 0,
      reason: 'No hay suficientes datos válidos (tiempo/cantidad) para regresión lineal.',
    };
  }

  slope = slope * 0.85;

  if (slope < 0.5) {
    return {
      canPredict: true,
      currentTemperature,
      predictedMax: Number((currentTemperature + slope * horizonMinutes).toFixed(2)),
      predictedMaxMinute: horizonMinutes,
      alertLevel: 0,
      reason: `Pendiente muy baja (${slope.toFixed(2)}°C/min) tras ajuste conservador.`,
    };
  }

  const predictedMax = currentTemperature + slope * horizonMinutes;

  let alertLevel: 0 | 2 | 3 = 0;
  let targetThreshold: number | undefined = undefined;

  if (
    shouldCreatePredictiveAlert({
      currentTemperature,
      threshold: threshold3,
      slopeCPerMinute: slope,
      predictionWindowMinutes: horizonMinutes,
    })
  ) {
    alertLevel = 3;
    targetThreshold = threshold3;
  } else if (
    shouldCreatePredictiveAlert({
      currentTemperature,
      threshold: threshold2,
      slopeCPerMinute: slope,
      predictionWindowMinutes: horizonMinutes,
    })
  ) {
    alertLevel = 2;
    targetThreshold = threshold2;
  }

  if (alertLevel > 0 && targetThreshold !== undefined) {
    const minutesToThreshold = (targetThreshold - currentTemperature) / slope;

    console.log(
      `[PREDICTIVE] currentTemp=${currentTemperature.toFixed(2)} threshold=${targetThreshold} slope=${slope.toFixed(2)}°C/min predicted10min=${predictedMax.toFixed(2)} minutesToThreshold=${minutesToThreshold.toFixed(2)} diffTempTrend=${diffTempTrend}`,
    );

    return {
      canPredict: true,
      currentTemperature,
      predictedMax: Number(predictedMax.toFixed(2)),
      predictedMaxMinute: horizonMinutes,
      alertLevel,
      thresholdToBeExceeded: targetThreshold,
      minutesToThreshold: Number(minutesToThreshold.toFixed(2)),
      notificationMessage: `La T° podría superar los ${targetThreshold}°C en ${Math.ceil(minutesToThreshold)} min.`,
      reason: `Tendencia acelerada: posible superación de ${targetThreshold}°C en ${Math.ceil(minutesToThreshold)} min.`,
      slope: Number(slope.toFixed(4)),
    };
  }

  console.log(
    `[PREDICTIVE] currentTemp=${currentTemperature.toFixed(2)} threshold=${threshold2}(T2)/${threshold3}(T3) slope=${slope.toFixed(2)}°C/min predicted10min=${predictedMax.toFixed(2)} diffTempTrend=${diffTempTrend}`,
  );
  console.log('[PREDICTIVE] No se genera alerta: no alcanza threshold dentro de la ventana predictiva.');

  return {
    canPredict: true,
    currentTemperature,
    predictedMax: Number(predictedMax.toFixed(2)),
    predictedMaxMinute: horizonMinutes,
    alertLevel: 0,
    reason: 'La predicción no supera los umbrales dentro de la ventana de predicción.',
  };
}