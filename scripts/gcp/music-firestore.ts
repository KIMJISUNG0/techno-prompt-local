/**
 * 음악 분석 특화 Firestore 스키마 및 초기 데이터 설정
 */
import { Firestore, FieldValue } from '@google-cloud/firestore';

export interface MusicAnalysisSchema {
  // 음악 분석 결과
  analyses: {
    id: string;
    type: 'bpm' | 'genre' | 'pattern' | 'chord' | 'structure';
    audioFile: string; // Cloud Storage 경로
    results: {
      confidence: number;
      data: any;
      model: string;
      processingTimeMs: number;
    };
    metadata: {
      createdAt: Date;
      colabSessionId?: string;
      tags: string[];
    };
  };

  // 사용자 생성 프롬프트
  prompts: {
    id: string;
    content: string;
    genre: string[];
    parameters: {
      bpm: number;
      instruments: string[];
      effects: string[];
    };
    analytics: {
      generated: Date;
      usage: number;
      rating?: number;
    };
  };

  // 음악 패턴 라이브러리
  patterns: {
    id: string;
    name: string;
    genre: string;
    type: 'drum' | 'bass' | 'melody' | 'chord';
    pattern: number[]; // MIDI 패턴
    metadata: {
      bpm: number;
      timeSignature: string;
      key?: string;
      difficulty: 1 | 2 | 3 | 4 | 5;
    };
  };
}

export class MusicFirestoreManager {
  private db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore({ projectId });
  }

  /**
   * 초기 음악 패턴 라이브러리 설정
   */
  async initializeMusicPatterns() {
    // eslint-disable-next-line no-console
    console.log('🎵 음악 패턴 라이브러리 초기화...');

    const defaultPatterns = [
      {
        id: 'techno-kick-basic',
        name: 'Basic Techno Kick',
        genre: 'techno',
        type: 'drum' as const,
        pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // 4/4 kick
        metadata: {
          bpm: 128,
          timeSignature: '4/4',
          difficulty: 1 as const,
        },
      },
      {
        id: 'techno-hihat-pattern',
        name: 'Syncopated Hi-Hat',
        genre: 'techno',
        type: 'drum' as const,
        pattern: [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0],
        metadata: {
          bpm: 128,
          timeSignature: '4/4',
          difficulty: 2 as const,
        },
      },
      {
        id: 'acid-bass-line',
        name: 'Classic Acid Bass',
        genre: 'techno',
        type: 'bass' as const,
        pattern: [60, 0, 63, 0, 65, 0, 67, 0, 65, 0, 63, 0, 60, 0, 58, 0], // MIDI notes
        metadata: {
          bpm: 132,
          timeSignature: '4/4',
          key: 'C',
          difficulty: 3 as const,
        },
      },
      // Hip-Hop 패턴
      {
        id: 'hiphop-boom-bap',
        name: 'Boom Bap Pattern',
        genre: 'hiphop',
        type: 'drum' as const,
        pattern: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
        metadata: {
          bpm: 90,
          timeSignature: '4/4',
          difficulty: 2 as const,
        },
      },
      // Trap 패턴
      {
        id: 'trap-hihat-roll',
        name: 'Trap Hi-Hat Roll',
        genre: 'trap',
        type: 'drum' as const,
        pattern: [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
        metadata: {
          bpm: 140,
          timeSignature: '4/4',
          difficulty: 4 as const,
        },
      },
    ];

    const batch = this.db.batch();
    
    for (const pattern of defaultPatterns) {
      const ref = this.db.collection('patterns').doc(pattern.id);
      batch.set(ref, pattern);
    }

    await batch.commit();
    // eslint-disable-next-line no-console
    console.log(`✅ ${defaultPatterns.length}개 음악 패턴 추가 완료`);
  }

  /**
   * 분석 결과 저장
   */
  async saveAnalysis(analysis: Omit<MusicAnalysisSchema['analyses'], 'id'>) {
    const ref = await this.db.collection('analyses').add({
      ...analysis,
      metadata: {
        ...analysis.metadata,
        createdAt: new Date(),
      },
    });
    
    // eslint-disable-next-line no-console
    console.log(`✅ 분석 결과 저장: ${ref.id}`);
    return ref.id;
  }

  /**
   * 프롬프트 사용 통계 업데이트
   */
  async updatePromptUsage(promptId: string) {
    const ref = this.db.collection('prompts').doc(promptId);
    await ref.update({
      'analytics.usage': FieldValue.increment(1),
    });
  }

  /**
   * 인기 패턴 조회 (장르별)
   */
  async getPopularPatterns(genre?: string, limit = 10) {
    let query = this.db.collection('patterns').orderBy('metadata.difficulty').limit(limit);
    
    if (genre) {
      query = query.where('genre', '==', genre);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * 실시간 분석 통계
   */
  async getAnalyticsSnapshot() {
    const [analysesSnapshot, promptsSnapshot, patternsSnapshot] = await Promise.all([
      this.db.collection('analyses').count().get(),
      this.db.collection('prompts').count().get(),
      this.db.collection('patterns').count().get(),
    ]);

    return {
      totalAnalyses: analysesSnapshot.data().count,
      totalPrompts: promptsSnapshot.data().count,
      totalPatterns: patternsSnapshot.data().count,
      timestamp: new Date(),
    };
  }
}

// 환경 변수 기반 인스턴스
export const musicDb = new MusicFirestoreManager(process.env.GCP_PROJECT_ID);

// 초기화 스크립트 (한 번만 실행)
if (require.main === module) {
  musicDb.initializeMusicPatterns().then(() => {
    // eslint-disable-next-line no-console
    console.log('🎉 음악 데이터베이스 초기화 완료!');
    process.exit(0);
  }).catch(console.error);
}