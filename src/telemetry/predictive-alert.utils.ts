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
  const minutesToThreshold = ((threshold - currentTemperature) / slopeCPerMinute) + 2;

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
  const MIN_TEMP_TO_PREDICT = 100;

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

  // Tomamos hasta los últimos 10 puntos de los últimos 10 minutos relativos al dato más reciente
  const selectedPoints = validPoints
    .filter((p) => new Date(p.createdAt).getTime() >= windowStartTime)
    .slice(-10);

  const currentTemperature = selectedPoints[selectedPoints.length - 1]?.temperature ?? 0;

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

  // Hacer la predicción más conservadora (Opción A):
  // 1. Penalizamos la pendiente reduciéndola un 15% para evitar sobreestimar
  slope = slope * 0.85;

  // 2. Si la pendiente resultante es muy baja, ignoramos para evitar falsas alarmas
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

  if (shouldCreatePredictiveAlert({ currentTemperature, threshold: threshold3, slopeCPerMinute: slope, predictionWindowMinutes: horizonMinutes })) {
    alertLevel = 3;
    targetThreshold = threshold3;
  } else if (shouldCreatePredictiveAlert({ currentTemperature, threshold: threshold2, slopeCPerMinute: slope, predictionWindowMinutes: horizonMinutes })) {
    alertLevel = 2;
    targetThreshold = threshold2;
  }

  if (alertLevel > 0 && targetThreshold !== undefined) {
    const minutesToThreshold = ((targetThreshold - currentTemperature) / slope) + 2;
    
    console.log(`[PREDICTIVE] currentTemp=${currentTemperature.toFixed(2)} threshold=${targetThreshold} slope=${slope.toFixed(2)}°C/min predicted10min=${predictedMax.toFixed(2)} minutesToThreshold=${minutesToThreshold.toFixed(2)}`);
    
    return {
      canPredict: true,
      currentTemperature,
      predictedMax: Number(predictedMax.toFixed(2)),
      predictedMaxMinute: horizonMinutes,
      alertLevel,
      thresholdToBeExceeded: targetThreshold,
      minutesToThreshold: Number(minutesToThreshold.toFixed(2)),
      notificationMessage: `La T° superará el umbral de ${targetThreshold}°C en ${Math.ceil(minutesToThreshold)} min.`,
      reason: `La pendiente es de ${slope.toFixed(2)}°C/min, superará el umbral de ${targetThreshold}°C en aprox ${Math.ceil(minutesToThreshold)} minutos.`,
    };
  } else {
    console.log(`[PREDICTIVE] currentTemp=${currentTemperature.toFixed(2)} threshold=${threshold2}(T2)/${threshold3}(T3) slope=${slope.toFixed(2)}°C/min predicted10min=${predictedMax.toFixed(2)}`);
    console.log(`[PREDICTIVE] No se genera alerta: no alcanza threshold dentro de la ventana predictiva.`);
    
    return {
      canPredict: true,
      currentTemperature,
      predictedMax: Number(predictedMax.toFixed(2)),
      predictedMaxMinute: horizonMinutes,
      alertLevel: 0,
      reason: 'La predicción no supera los umbrales dentro de la ventana de predicción.',
    };
  }
}
