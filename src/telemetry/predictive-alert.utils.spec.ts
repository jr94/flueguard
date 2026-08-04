import {
  calculatePredictiveCurveAlert,
  TemperaturePoint,
} from './predictive-alert.utils';

describe('Predictive Alert Utils - Separate Windows & Umbrales', () => {
  const baseTime = Date.now();

  // Helper to generate points on a straight line.
  // Using clean even or integer values for rawSlope avoids JS floating-point subtraction precision issues.
  function generateLinearPoints(currentTemp: number, rawSlope: number): TemperaturePoint[] {
    const points: TemperaturePoint[] = [];
    for (let i = 0; i < 10; i++) {
      const timeOffsetSec = (i - 9) * 30; // 30s intervals
      const timeOffsetMin = timeOffsetSec / 60; // -4.5 to 0 mins
      const temp = currentTemp + rawSlope * timeOffsetMin;
      points.push({
        temperature: temp,
        createdAt: new Date(baseTime + timeOffsetSec * 1000),
      });
    }
    return points;
  }

  describe('Nivel 2 predictive alert (LEVEL_2_PREDICTION_WINDOW_MINUTES = 5)', () => {
    const threshold2 = 230;
    const threshold3 = 350;

    it('should trigger Level 2 predictive alert when threshold2 is reached in 4 minutes', () => {
      // slope = 10 * 0.85 = 8.5. 230 - 196 = 34. 34 / 8.5 = 4 minutes.
      const points = generateLinearPoints(196, 10);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(2);
      expect(result.thresholdToBeExceeded).toBe(threshold2);
      expect(result.minutesToThreshold).toBe(4);
    });

    it('should trigger Level 2 predictive alert when threshold2 is reached in exactly 5 minutes', () => {
      // slope = 10 * 0.85 = 8.5. 230 - 187.5 = 42.5. 42.5 / 8.5 = 5 minutes.
      const points = generateLinearPoints(187.5, 10);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(2);
      expect(result.thresholdToBeExceeded).toBe(threshold2);
      expect(result.minutesToThreshold).toBe(5);
    });

    it('should NOT trigger Level 2 predictive alert when threshold2 is reached in 5.1 minutes', () => {
      // slope = 10 * 0.85 = 8.5. 230 - 186.65 = 43.35. 43.35 / 8.5 = 5.1 minutes.
      const points = generateLinearPoints(186.65, 10);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(0);
    });

    it('should NOT trigger Level 2 predictive alert when threshold2 is reached in 9 minutes (> 5 minutes)', () => {
      // slope = 6.5 * 0.85 = 5.525. (230 - 180) / 5.525 = 9.05 minutes.
      // Since currentTemp = 180 >= 180 and rawSlope = 6.5 > 6, canPredict is true, but alertLevel should be 0 because 9 > 5.
      const points = generateLinearPoints(180, 6.5);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);
 
      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(0);
    });
  });

  describe('Nivel 3 predictive alert (LEVEL_3_PREDICTION_WINDOW_MINUTES = 10)', () => {
    const threshold2 = 230;
    const threshold3 = 350;

    it('should NOT trigger Level 3 predictive alert when current temperature is 299.9 °C', () => {
      const points = generateLinearPoints(299.9, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.alertLevel).not.toBe(3);
    });

    it('should NOT trigger Level 3 predictive alert when current temperature is 300 °C', () => {
      const points = generateLinearPoints(300, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.alertLevel).not.toBe(3);
    });

    it('should trigger Level 3 predictive alert when current temperature is 300.1 °C', () => {
      // slope = 12 * 0.85 = 10.2. (350 - 300.1) / 10.2 = 4.89 minutes.
      const points = generateLinearPoints(300.1, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, threshold3, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(threshold3);
      expect(result.minutesToThreshold).toBe(4.89);
    });

    it('should trigger Level 3 predictive alert when threshold3 is reached in 9 minutes', () => {
      // slope = 12 * 0.85 = 10.2. threshold3 = 400. 400 - 308.2 = 91.8. 91.8 / 10.2 = 9 minutes.
      const points = generateLinearPoints(308.2, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, 400, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(400);
      expect(result.minutesToThreshold).toBe(9);
    });

    it('should trigger Level 3 predictive alert when threshold3 is reached in exactly 10 minutes', () => {
      // slope = 12 * 0.85 = 10.2. threshold3 = 412. 412 - 310 = 102. 102 / 10.2 = 10 minutes.
      const points = generateLinearPoints(310, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, 412, 10);

      expect(result.canPredict).toBe(true);
      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(412);
      expect(result.minutesToThreshold).toBe(10);
    });

    it('should NOT trigger Level 3 predictive alert when threshold3 is reached in 10.1 minutes', () => {
      // slope = 12 * 0.85 = 10.2. threshold3 = 413.02. 413.02 - 310 = 103.02. 103.02 / 10.2 = 10.1 minutes.
      const points = generateLinearPoints(310, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, 413.02, 10);

      expect(result.alertLevel).not.toBe(3);
    });
  });

  describe('Different threshold3 configurations', () => {
    const threshold2 = 230;

    it('should work with threshold3 = 330 °C', () => {
      const points = generateLinearPoints(310, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, 330, 10);
      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(330);
      expect(result.minutesToThreshold).toBe(1.96);
    });

    it('should work with threshold3 = 400 °C', () => {
      const points = generateLinearPoints(310, 12);
      const result = calculatePredictiveCurveAlert(points, threshold2, 400, 10);
      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(400);
      expect(result.minutesToThreshold).toBe(8.82);
    });
  });

  describe('Slope constraints', () => {
    it('should NOT trigger alert if slope is zero or negative', () => {
      const points = generateLinearPoints(310, 0);
      const result = calculatePredictiveCurveAlert(points, 230, 350, 10);
      expect(result.alertLevel).toBe(0);
    });
  });

  describe('Priority L3 over L2', () => {
    it('should prioritize Level 3 when both are met', () => {
      // threshold2 = 320, threshold3 = 350.
      // currentTemp = 310 > 300.
      // slope = 24 * 0.85 = 20.4.
      // minutesToThreshold2 = (320-310)/20.4 = 0.49 (<= 5)
      // minutesToThreshold3 = (350-310)/20.4 = 1.96 (<= 10)
      // Both met! L3 has priority.
      const points = generateLinearPoints(310, 24);
      const result = calculatePredictiveCurveAlert(points, 320, 350, 10);

      expect(result.alertLevel).toBe(3);
      expect(result.thresholdToBeExceeded).toBe(350);
    });
  });
});
