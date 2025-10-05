/**
 * GCP + Colab 통합 유틸리티
 * 코랩에서 분석 결과를 Cloud Storage에 저장하고 앱에서 활용
 */
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';

export interface ColabAnalysisResult {
  timestamp: string;
  analysisType: 'audio' | 'pattern' | 'genre';
  inputData: any;
  results: any;
  metadata: {
    colabSessionId: string;
    processingTimeMs: number;
    modelUsed?: string;
  };
}

export class GCPColabBridge {
  private storage: Storage;
  private firestore: Firestore;
  private bucketName: string;

  constructor(options: {
    bucketName: string;
    projectId?: string;
  }) {
    this.bucketName = options.bucketName;
    this.storage = new Storage({
      projectId: options.projectId,
    });
    this.firestore = new Firestore({
      projectId: options.projectId,
    });
  }

  /**
   * 코랩에서 분석 결과를 업로드
   */
  async uploadAnalysisResult(result: ColabAnalysisResult): Promise<string> {
    const fileName = `analysis/${result.analysisType}/${result.timestamp}-${result.metadata.colabSessionId}.json`;
    
    const file = this.storage.bucket(this.bucketName).file(fileName);
    await file.save(JSON.stringify(result, null, 2), {
      metadata: {
        contentType: 'application/json',
        metadata: {
          analysisType: result.analysisType,
          timestamp: result.timestamp,
        },
      },
    });

    // Firestore에 메타데이터 저장 (빠른 조회용)
    await this.firestore
      .collection('colab_analyses')
      .doc(`${result.timestamp}-${result.metadata.colabSessionId}`)
      .set({
        fileName,
        analysisType: result.analysisType,
        timestamp: result.timestamp,
        processingTimeMs: result.metadata.processingTimeMs,
        createdAt: new Date(),
      });

    return fileName;
  }

  /**
   * 최근 분석 결과 조회 (앱에서 사용)
   */
  async getRecentAnalyses(
    type?: string,
    limit: number = 10
  ): Promise<ColabAnalysisResult[]> {
    let query = this.firestore
      .collection('colab_analyses')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (type) {
      query = query.where('analysisType', '==', type);
    }

    const snapshot = await query.get();
    const results: ColabAnalysisResult[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        const file = this.storage.bucket(this.bucketName).file(data.fileName);
        const [content] = await file.download();
        results.push(JSON.parse(content.toString()));
      } catch (error) {
        console.warn(`Failed to load analysis: ${data.fileName}`, error);
      }
    }

    return results;
  }

  /**
   * 코랩 노트북에서 사용할 Python 연동 코드 생성
   */
  generateColabCode(analysisType: string): string {
    return `
# GCP 연동을 위한 코랩 코드
import json
import uuid
from datetime import datetime
from google.cloud import storage, firestore

# 프로젝트 설정
PROJECT_ID = "${process.env.GCP_PROJECT_ID || 'your-project-id'}"
BUCKET_NAME = "${this.bucketName}"

def upload_analysis_result(analysis_type, input_data, results):
    """분석 결과를 GCP에 업로드"""
    
    # 결과 구조화
    result = {
        "timestamp": datetime.now().isoformat(),
        "analysisType": analysis_type,
        "inputData": input_data,
        "results": results,
        "metadata": {
            "colabSessionId": str(uuid.uuid4())[:8],
            "processingTimeMs": 0,  # 실제 처리 시간으로 교체
            "modelUsed": "colab-analysis"
        }
    }
    
    # Cloud Storage 업로드
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(BUCKET_NAME)
    
    file_name = f"analysis/{analysis_type}/{result['timestamp']}-{result['metadata']['colabSessionId']}.json"
    blob = bucket.blob(file_name)
    blob.upload_from_string(
        json.dumps(result, indent=2),
        content_type='application/json'
    )
    
    # Firestore 메타데이터 저장
    db = firestore.Client(project=PROJECT_ID)
    db.collection('colab_analyses').document(
        f"{result['timestamp']}-{result['metadata']['colabSessionId']}"
    ).set({
        'fileName': file_name,
        'analysisType': analysis_type,
        'timestamp': result['timestamp'],
        'processingTimeMs': result['metadata']['processingTimeMs'],
        'createdAt': firestore.SERVER_TIMESTAMP
    })
    
    print(f"✅ Analysis uploaded: {file_name}")
    return file_name

# 사용 예시:
# result = upload_analysis_result(
#     "${analysisType}",
#     {"input": "sample data"},
#     {"analysis": "results"}
# )
`;
  }
}

// 환경 변수 기반 인스턴스
export const colabBridge = new GCPColabBridge({
  bucketName: process.env.GCP_STORAGE_BUCKET || 'techno-prompt-storage',
  projectId: process.env.GCP_PROJECT_ID,
});