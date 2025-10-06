/**
 * GCP 무료 한도 모니터링 및 비용 최적화 대시보드
 */
import { MetricServiceClient } from '@google-cloud/monitoring';
import { musicDb } from './music-firestore';

export interface GCPUsageStats {
  cloudRun: {
    requests: number;
    maxFreeRequests: 2000000; // 월 2M
    cpuTime: number;
    maxFreeCpuTime: 180000; // 180K vCPU-초
  };
  cloudStorage: {
    storageGB: number;
    maxFreeStorage: 5; // 5GB
    operations: number;
  };
  firestore: {
    reads: number;
    writes: number;
    maxFreeReads: 50000;
    maxFreeWrites: 20000;
    storageGB: number;
    maxFreeStorageGB: 1;
  };
  vertexAI: {
    predictionRequests: number;
    trainingHours: number;
    remainingCredits: number; // $300 크레딧
  };
}

export class GCPUsageMonitor {
  private monitoring: MetricServiceClient;
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.monitoring = new MetricServiceClient();
  }

  /**
   * 현재 GCP 사용량 조회
   */
  async getCurrentUsage(): Promise<GCPUsageStats> {
    try {
      // 실제로는 Cloud Monitoring API를 통해 메트릭 수집
      // 여기서는 Mock 데이터로 구현
      const usage: GCPUsageStats = {
        cloudRun: {
          requests: await this.getCloudRunRequests(),
          maxFreeRequests: 2000000,
          cpuTime: await this.getCloudRunCpuTime(),
          maxFreeCpuTime: 180000,
        },
        cloudStorage: {
          storageGB: await this.getStorageUsage(),
          maxFreeStorage: 5,
          operations: await this.getStorageOperations(),
        },
        firestore: {
          reads: await this.getFirestoreReads(),
          writes: await this.getFirestoreWrites(),
          maxFreeReads: 50000,
          maxFreeWrites: 20000,
          storageGB: await this.getFirestoreStorage(),
          maxFreeStorageGB: 1,
        },
        vertexAI: {
          predictionRequests: await this.getVertexAIPredictions(),
          trainingHours: 0, // 현재 미사용
          remainingCredits: 285, // $300에서 $15 사용 가정
        },
      };

      return usage;
    } catch (error) {
      console.error('사용량 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 무료 한도 경고 확인
   */
  async checkFreeQuotaWarnings(): Promise<
    Array<{
      service: string;
      usage: number;
      limit: number;
      percentage: number;
      severity: 'info' | 'warning' | 'critical';
      recommendation: string;
    }>
  > {
    const usage = await this.getCurrentUsage();
    const warnings = [];

    // Cloud Run 요청 수 체크
    const runRequestsPercent = (usage.cloudRun.requests / usage.cloudRun.maxFreeRequests) * 100;
    if (runRequestsPercent > 80) {
      warnings.push({
        service: 'Cloud Run Requests',
        usage: usage.cloudRun.requests,
        limit: usage.cloudRun.maxFreeRequests,
        percentage: runRequestsPercent,
        severity: runRequestsPercent > 95 ? ('critical' as const) : ('warning' as const),
        recommendation: 'API 호출 최적화 또는 캐싱 구현 고려',
      });
    }

    // Cloud Storage 용량 체크
    const storagePercent = (usage.cloudStorage.storageGB / usage.cloudStorage.maxFreeStorage) * 100;
    if (storagePercent > 70) {
      warnings.push({
        service: 'Cloud Storage',
        usage: usage.cloudStorage.storageGB,
        limit: usage.cloudStorage.maxFreeStorage,
        percentage: storagePercent,
        severity: storagePercent > 90 ? ('critical' as const) : ('warning' as const),
        recommendation: '오래된 분석 결과 삭제 또는 압축 저장',
      });
    }

    // Firestore 읽기 체크
    const firestoreReadsPercent = (usage.firestore.reads / usage.firestore.maxFreeReads) * 100;
    if (firestoreReadsPercent > 75) {
      warnings.push({
        service: 'Firestore Reads',
        usage: usage.firestore.reads,
        limit: usage.firestore.maxFreeReads,
        percentage: firestoreReadsPercent,
        severity: firestoreReadsPercent > 90 ? ('critical' as const) : ('warning' as const),
        recommendation: '쿼리 최적화 또는 로컬 캐싱 구현',
      });
    }

    return warnings;
  }

  /**
   * 비용 최적화 제안
   */
  async getCostOptimizationTips(): Promise<
    Array<{
      category: string;
      tip: string;
      estimatedSavings: string;
      priority: 'high' | 'medium' | 'low';
    }>
  > {
    const usage = await this.getCurrentUsage();
    const tips = [];

    // Cloud Run 최적화
    if (usage.cloudRun.requests > 1000000) {
      tips.push({
        category: 'Cloud Run',
        tip: '요청 응답 캐싱을 통해 중복 계산 방지',
        estimatedSavings: '월 요청 수 30% 감소',
        priority: 'high' as const,
      });
    }

    // 음악 분석 최적화
    tips.push({
      category: '음악 분석',
      tip: '코랩에서 처리 후 결과만 저장 (Vertex AI 사용량 최소화)',
      estimatedSavings: 'AI 크레딧 50% 절약',
      priority: 'high' as const,
    });

    // 스토리지 최적화
    if (usage.cloudStorage.storageGB > 3) {
      tips.push({
        category: 'Storage',
        tip: '30일 이상 된 분석 결과 자동 삭제 정책 설정',
        estimatedSavings: '스토리지 용량 40% 절약',
        priority: 'medium' as const,
      });
    }

    return tips;
  }

  /**
   * 사용량 리포트 생성
   */
  async generateUsageReport(): Promise<{
    summary: GCPUsageStats;
    warnings: any[];
    tips: any[];
    musicAnalyticsInsight: {
      totalAnalyses: number;
      averageDailyUsage: number;
      projectedMonthlyUsage: string;
    };
  }> {
    const [summary, warnings, tips, analytics] = await Promise.all([
      this.getCurrentUsage(),
      this.checkFreeQuotaWarnings(),
      this.getCostOptimizationTips(),
      musicDb.getAnalyticsSnapshot(),
    ]);

    const musicAnalyticsInsight = {
      totalAnalyses: analytics.totalAnalyses,
      averageDailyUsage: analytics.totalAnalyses / 30, // 최근 30일 기준
      projectedMonthlyUsage: `${(analytics.totalAnalyses / 30) * 30} 분석`,
    };

    return {
      summary,
      warnings,
      tips,
      musicAnalyticsInsight,
    };
  }

  // 개별 메트릭 조회 메서드들 (Mock 구현)
  private async getCloudRunRequests(): Promise<number> {
    // 실제로는 Cloud Monitoring API 호출
    return Math.floor(Math.random() * 500000);
  }

  private async getCloudRunCpuTime(): Promise<number> {
    return Math.floor(Math.random() * 50000);
  }

  private async getStorageUsage(): Promise<number> {
    return Math.random() * 2; // 0-2GB 사용 중
  }

  private async getStorageOperations(): Promise<number> {
    return Math.floor(Math.random() * 10000);
  }

  private async getFirestoreReads(): Promise<number> {
    return Math.floor(Math.random() * 20000);
  }

  private async getFirestoreWrites(): Promise<number> {
    return Math.floor(Math.random() * 5000);
  }

  private async getFirestoreStorage(): Promise<number> {
    return Math.random() * 0.5; // 0-0.5GB
  }

  private async getVertexAIPredictions(): Promise<number> {
    return Math.floor(Math.random() * 1000);
  }
}

// 환경 변수 기반 인스턴스
export const usageMonitor = new GCPUsageMonitor(process.env.GCP_PROJECT_ID || 'techno-prompt-project');

// CLI 실행 (사용량 리포트)
if (require.main === module) {
  usageMonitor
    .generateUsageReport()
    .then(report => {
      // eslint-disable-next-line no-console
      console.log('📊 GCP 사용량 리포트:', JSON.stringify(report, null, 2));
    })
    .catch(console.error);
}
