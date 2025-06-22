import React from 'react';
import type { TestType } from '../types';

interface TestInfoProps {
  testType: TestType;
}

/**
 * テストの説明と実施方法を表示するコンポーネント
 */
const TestInfo: React.FC<TestInfoProps> = ({ testType }) => {
  // テストの種類に応じた情報を表示
  const getTestInfo = () => {
    switch (testType) {
      case 'standingHipFlex':
        return {
          title: '立位股関節屈曲テスト',
          description: '立位で片脚を前方に持ち上げ、体幹を安定させたまま股関節を屈曲させるテストです。',
          instructions: [
            '両足を肩幅に開いて直立姿勢をとります。',
            '片脚を前方に持ち上げ、膝を約90度に曲げます。',
            '骨盤と脊柱を安定させたまま、できるだけ高く脚を上げます。',
            '3〜5秒間その姿勢を保持します。'
          ],
          evaluationPoints: [
            '股関節の屈曲角度',
            '腰椎の動き（過度な前弯や後弯がないか）',
            '骨盤の傾斜（前傾や側方傾斜がないか）',
            '体幹の安定性'
          ],
          purpose: '腰椎-骨盤-股関節リズムの評価と股関節屈曲時の腰椎安定性を評価します。'
        };
      
      case 'rockBack':
        return {
          title: 'ロックバックテスト',
          description: '四つ這い姿勢から骨盤を後方に移動させるテストです。腰椎の安定性と運動制御を評価します。',
          instructions: [
            '四つ這い姿勢をとります（手と膝をついた姿勢）。',
            '背中をまっすぐに保ちながら、骨盤をゆっくりと踵の方向に後退させます。',
            '腰椎の生理的なカーブを維持したまま、腰が丸まらないように注意します。',
            '可能な限り後方に移動し、3秒間保持します。'
          ],
          evaluationPoints: [
            '骨盤の後方移動範囲',
            '腰椎の中立位維持能力',
            '動作中の脊柱の安定性',
            '左右対称性'
          ],
          purpose: '腰部深層筋の制御と腰椎の安定性を評価します。腰痛患者ではしばしば腰椎のニュートラルゾーンコントロールが困難になります。'
        };

      case 'seatedKneeExt':
        return {
          title: '座位膝関節伸展テスト',
          description: '座位で膝関節を伸展させる際の腰椎と骨盤の安定性を評価するテストです。',
          instructions: [
            '硬い面に深く腰掛け、背中は自然なカーブを維持します。',
            'テスト側の脚を徐々に伸ばしていきます（完全に伸ばす必要はありません）。',
            '腰椎と骨盤の位置を維持したまま動作を行います。',
            '膝が完全に伸びる前に腰椎が反り始めたり、骨盤が後傾するポイントを観察します。'
          ],
          evaluationPoints: [
            '腰椎の中立位維持能力',
            '骨盤の位置維持能力',
            'ハムストリングスの柔軟性',
            '動作の質と代償動作の有無'
          ],
          purpose: 'ハムストリングスの柔軟性と腰椎-骨盤リズムを評価します。座位での膝伸展は日常生活でも頻繁に行われる動作です。'
        };

      default:
        return {
          title: 'テストを選択してください',
          description: '左側のメニューからテストの種類を選択してください。',
          instructions: [],
          evaluationPoints: [],
          purpose: ''
        };
    }
  };

  const info = getTestInfo();

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-3 text-blue-800">{info.title}</h2>
      <p className="mb-4 text-gray-700">{info.description}</p>
      
      {info.purpose && (
        <div className="mb-4">
          <h3 className="font-semibold text-blue-700">目的</h3>
          <p className="text-gray-700">{info.purpose}</p>
        </div>
      )}
      
      {info.instructions.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold text-blue-700">実施方法</h3>
          <ol className="list-decimal pl-5 space-y-1">
            {info.instructions.map((instruction, i) => (
              <li key={i} className="text-gray-700">{instruction}</li>
            ))}
          </ol>
        </div>
      )}
      
      {info.evaluationPoints.length > 0 && (
        <div>
          <h3 className="font-semibold text-blue-700">評価ポイント</h3>
          <ul className="list-disc pl-5 space-y-1">
            {info.evaluationPoints.map((point, i) => (
              <li key={i} className="text-gray-700">{point}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="mt-4 text-sm text-gray-500">
        <p>※ このテスト結果は参考情報です。正確な診断には専門家による対面評価が必要です。</p>
      </div>
    </div>
  );
};

export default TestInfo;
