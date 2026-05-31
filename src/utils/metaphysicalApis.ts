/**
 * Metaphysical APIs Wrapper & Simulator
 * Provides client wrappers, source API metadata, and high-fidelity deterministic mock data
 * for DivineAPI, AstrologyAPI, VedAstro, Chinese Metasoft/Luck Pillars/KlavisAI MCP,
 * RoxyAPI/strobus/i-ching, and the new metaphysical matrix systems:
 * Zi Wei Dou Shu, Nine Star Ki, Maya Calendar, Kabbalah, Human Design, and Geomancy.
 */

import { BaziResult } from './baziEngine';
import { getCurrentZodiac, getHonmeiStar } from './ephemerisEngine';

export interface TarotCard {
  name: string;
  suit: string;
  arcana: 'Major' | 'Minor';
  orientation: 'Upright' | 'Reversed';
  meaning: string;
  riskModifier: number;
}

export interface NumerologyData {
  lifePathNumber: number;
  description: string;
}

export interface MetaphysicalData {
  divineApi: {
    tarot: TarotCard;
    numerology: NumerologyData;
    sourceInfo: string;
  };
  astrologyApi: {
    horoscope: string;
    aspects: { aspect: string; angle: number; quality: 'harmonious' | 'discordant' | 'neutral' }[];
    sourceInfo: string;
  };
  vedAstro: {
    activeDasha: string;
    ashtakavargaPoints: Record<string, number>;
    planetaryStrengths: Record<string, number>;
    sourceInfo: string;
  };
  chineseMetasoft: {
    qiMenGate: {
      name: string;
      direction: string;
      description: string;
      status: 'Auspicious' | 'Inauspicious' | 'Neutral';
    };
    daYunPillar: {
      pillar: string;
      startAge: number;
      endAge: number;
      description: string;
    } | null;
    sourceInfo: string;
  };
  roxyApi: {
    ichingCast: {
      hexagramNumber: number;
      name: string;
      lines: number[];
      changingLines: number[];
      relatingHexagram: {
        number: number;
        name: string;
      } | null;
      interpretation: string;
    };
    sourceInfo: string;
  };

  // NEW Matrix Systems added for comprehensive mapping:
  ziWeiDouShu?: {
    selfPalaceStar: string;
    bodyPalaceStar: string;
    activeFlyingStar: string;
    palacePosition: string;
    dailyInsight: string;
    sourceInfo: string;
  };
  nineStarKi?: {
    yearStar: string;
    monthStar: string;
    dayStar: string;
    magicSquareLocation: string;
    dailyDirectionSafety: string;
    sourceInfo: string;
  };
  mayaTzolkin?: {
    kinNumber: number;
    solarSeal: { name: string; glyph: string; meaning: string };
    galacticTone: { tone: number; name: string; power: string };
    dailyGuidance: string;
    sourceInfo: string;
  };
  kabbalahTree?: {
    activeSephirah: string;
    pathOfResonance: string;
    hebrewLetter: string;
    dailyVibrationScore: number;
    insight: string;
    sourceInfo: string;
  };
  humanDesign?: {
    chartType: string;
    authority: string;
    profile: string;
    activeChannels: string[];
    dailyGateActivation: string;
    sourceInfo: string;
  };
  geomancy?: {
    figureName: string;
    binaryPoints: number[];
    element: string;
    astrologicalAssociation: string;
    interpretation: string;
    sourceInfo: string;
  };
}

// Simple LCG pseudo-random generator
function createRand(seedStr: string) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
}

const TAROT_DECK: Omit<TarotCard, 'orientation'>[] = [
  { name: '愚者 (The Fool)', suit: 'Major Arcana', arcana: 'Major', meaning: '新たな始まり、直感的な行動、リスクを恐れない決断。【活用法】思い切った移住や未経験の分野への挑戦に最適なタイミングです。', riskModifier: 10 },
  { name: '魔術師 (The Magician)', suit: 'Major Arcana', arcana: 'Major', meaning: '創造力、意志の力、リソースの活用。【活用法】現在のスキルを活かせる拠点を探し、自ら環境を切り開く行動を起こしてください。', riskModifier: -5 },
  { name: '女教皇 (The High Priestess)', suit: 'Major Arcana', arcana: 'Major', meaning: '直感、神秘、潜在意識、内なる知恵。【活用法】論理的なデータだけでなく、その土地に対する「直感」や「縁」を重視して決断してください。', riskModifier: -15 },
  { name: '女帝 (The Empress)', suit: 'Major Arcana', arcana: 'Major', meaning: '豊かさ、創造性、母性、自然、繁栄。【活用法】自然環境が豊かな土地や、生活の質（QOL）を高められる拠点への移住が大吉です。', riskModifier: -10 },
  { name: '皇帝 (The Emperor)', suit: 'Major Arcana', arcana: 'Major', meaning: '構造、安定、規則、権威、保護。【活用法】インフラが整った都市部や、ビジネスの基盤を強固にできるエリアが適しています。', riskModifier: -5 },
  { name: '教皇 (The Hierophant)', suit: 'Major Arcana', arcana: 'Major', meaning: '伝統、精神的な導き、制度、信念。【活用法】歴史ある地域や、信頼できる専門家・メンターのアドバイスに従うことが成功の鍵です。', riskModifier: -5 },
  { name: '恋人 (The Lovers)', suit: 'Major Arcana', arcana: 'Major', meaning: '人間関係、選択、価値観の共有、調和。【活用法】パートナーとの共同移住や、人との繋がりが深まるコミュニティ選びに注力してください。', riskModifier: 0 },
  { name: '戦車 (The Chariot)', suit: 'Major Arcana', arcana: 'Major', meaning: '意志の力、方向性、勝利、対立する力の制御。【活用法】多少の困難があっても、強い意志を持って移住計画を推進すべき時期です。', riskModifier: 10 },
  { name: '力 (Strength)', suit: 'Major Arcana', arcana: 'Major', meaning: '勇気、静かなる力、影響力、忍耐、思いやり。【活用法】長期的な視点を持ち、焦らずにじっくりと物件や拠点を探すことで最良の結果を得られます。', riskModifier: -10 },
  { name: '隠者 (The Hermit)', suit: 'Major Arcana', arcana: 'Major', meaning: '内観、自己探求、内なる導き、孤独。【活用法】静かな環境、郊外、または一人で集中して作業できるリトリート的な拠点が吉です。', riskModifier: -15 },
  { name: '運命の輪 (Wheel of Fortune)', suit: 'Major Arcana', arcana: 'Major', meaning: '幸運、カルマ、宿命、転換点、変化のサイクル。【活用法】運気が大きく動くタイミングです。偶然の出会いや予期せぬ物件情報に飛び乗るのが吉。', riskModifier: 5 },
  { name: '正義 (Justice)', suit: 'Major Arcana', arcana: 'Major', meaning: '公平さ、真実、因果応報、法的な事柄。【活用法】契約や手続きを慎重に行うべき時です。不動産契約等の条件面を冷静に精査してください。', riskModifier: 0 },
  { name: '吊るされた男 (The Hanged Man)', suit: 'Major Arcana', arcana: 'Major', meaning: '降伏、一時停止、手放すこと、新たな視点、犠牲。【活用法】計画が一時停止しやすい時期。焦らず、別の視点からエリアや条件を見直してみてください。', riskModifier: -5 },
  { name: '死神 (Death)', suit: 'Major Arcana', arcana: 'Major', meaning: '終わり、移行、変容、古いものを手放す。【活用法】現在の環境への執着を捨て、完全に新しい生活スタイルへシフトするのに最適な時期です。', riskModifier: 15 },
  { name: '節制 (Temperance)', suit: 'Major Arcana', arcana: 'Major', meaning: 'バランス、中庸、調和、忍耐、錬金術。【活用法】極端な条件を避け、家賃と環境、都会と自然のバランスが取れた「中庸」の地を選んでください。', riskModifier: -10 },
  { name: '悪魔 (The Devil)', suit: 'Major Arcana', arcana: 'Major', meaning: 'シャドウセルフ、執着、依存、物質主義、制限。【活用法】目先の利益や見栄（高層マンション等）に囚われていないか、動機を再確認すべき時期です。', riskModifier: 20 },
  { name: '塔 (The Tower)', suit: 'Major Arcana', arcana: 'Major', meaning: '突然の激変、崩壊、混沌、啓示、急激な変化。【活用法】予期せぬトラブルや急な引越しの可能性があります。リスク管理を最優先にしてください。', riskModifier: 25 },
  { name: '星 (The Star)', suit: 'Major Arcana', arcana: 'Major', meaning: '希望、再生、信仰、癒し、宇宙との繋がり。【活用法】理想のビジョンが叶う兆しです。妥協せず、本当に心から望む環境を引き寄せてください。', riskModifier: -15 },
  { name: '月 (The Moon)', suit: 'Major Arcana', arcana: 'Major', meaning: '幻想、恐れ、不安、欺瞞、鮮明な夢、直感。【活用法】情報に惑わされやすい時期。表面的な良い条件に隠れたデメリット（騒音・地盤等）に注意。', riskModifier: 15 },
  { name: '太陽 (The Sun)', suit: 'Major Arcana', arcana: 'Major', meaning: '活力、成功、温かさ、明晰さ、喜び、真実。【活用法】どこへ行っても成功しやすい大吉の時期です。日当たりが良く、エネルギーに満ちた場所を選んでください。', riskModifier: -20 },
  { name: '審判 (Judgement)', suit: 'Major Arcana', arcana: 'Major', meaning: '再生、内なる呼び声、免罪、重要な決定。【活用法】過去の経験から学び、人生の次のステージへ進むための最終決断を下すのに最適な時です。', riskModifier: -5 },
  { name: '世界 (The World)', suit: 'Major Arcana', arcana: 'Major', meaning: '完了、統合、達成、完全性、旅行。【活用法】一つのサイクルが完成しました。海外移住や長距離の引越しを含め、大きく羽ばたくのに最高運気です。', riskModifier: -15 },
];

const QI_MEN_GATES = [
  { name: '開門 (Kai Men - Open)', direction: 'NW', description: 'ビジネスの開始、転職、行動範囲の拡大に大吉。【活用法】キャリアアップを伴う引越しや、新規事業の拠点開設にこの方位を利用してください。', status: 'Auspicious' as const },
  { name: '休門 (Xiu Men - Rest)', direction: 'N', description: '休息、癒し、家族関係の修復に吉。【活用法】リフレッシュ目的の移住や、ワークライフバランスを重視する引越しに最適です。', status: 'Auspicious' as const },
  { name: '生門 (Sheng Men - Life)', direction: 'NE', description: '金運の上昇、不動産、構造的な成長に非常に吉。【活用法】資産価値の高い物件の購入や、経済的基盤を強固にするための移住に最も適しています。', status: 'Auspicious' as const },
  { name: '傷門 (Shang Men - Injury)', direction: 'E', description: '競争、借金の取り立て、狩猟以外には凶。【活用法】不要な争いやトラブルに巻き込まれやすい方位です。通常の引越しや旅行では避けてください。', status: 'Inauspicious' as const },
  { name: '杜門 (Du Men - Deliberation)', direction: 'SE', description: '秘密の保持、資産の隠匿、戦略的な撤退に適した中立な門。【活用法】プライバシーを重視する隠れ家的な拠点探しや、静かに準備を進める時期に有効です。', status: 'Neutral' as const },
  { name: '景門 (Jing Men - Scenery)', direction: 'S', description: 'マーケティング、ネットワーキング、公の発表に優れた中立な活動門。【活用法】露出を増やしたいクリエイターや、人脈を広げるための都市部への引越しに吉。', status: 'Neutral' as const },
  { name: '死門 (Si Men - Death)', direction: 'SW', description: '非常に凶。解体や埋葬の儀式以外には避けるべき門。【活用法】この方位への移動は停滞や損失を招く可能性が高いため、移住計画の対象から外してください。', status: 'Inauspicious' as const },
  { name: '驚門 (Jing Men - Fear)', direction: 'W', description: '不安や訴訟のリスクを引き起こす凶門。【活用法】精神的ストレスが増大しやすい方位です。この方位での契約や引越しは慎重に見送るのが無難です。', status: 'Inauspicious' as const },
];

const ICHING_HEXAGRAMS_ROXY: Record<number, string> = {
  1: '乾 (Qian) - The Creative / Force (創造・天)',
  2: '坤 (Kun) - The Receptive / Field (受容・地)',
  3: '屯 (Zhun) - Difficulty at the Beginning / Sprouting (生みの苦しみ)',
  4: '蒙 (Meng) - Youthful Folly / Enveloping (無知の啓蒙)',
  5: '需 (Xu) - Waiting (Nourishment) / Attending (待機・恵みの雨)',
  6: '訟 (Song) - Conflict / Arguing (争い・訴訟)',
  7: '師 (Shi) - The Army / Leading (軍隊・指導)',
  8: '比 (Bi) - Holding Together (Union) / Grouping (親密・結束)',
  9: '小畜 (Xiao Xu) - Small Accumulation / Taming (少しの蓄積)',
  10: '履 (Lv) - Treading (Conduct) / Treading (実践・礼儀)',
  11: '泰 (Tai) - Peace / Pervading (安泰・調和)',
  12: '否 (Pi) - Standstill (Obstruction) / Obstruction (閉塞・停滞)',
  29: '坎 (Kan) - The Abysmal (Water) / Gorge (困難・水)',
  30: '離 (Li) - The Clinging (Fire) / Radiance (付着・火・明知)',
  51: '震 (Zhen) - The Arousing (Thunder) / Shake (奮起・雷)',
  52: '艮 (Gen) - Keeping Still (Mountain) / Bound (静止・山)',
  57: '巽 (Xun) - The Gentle (Wind) / Ground (従順・風)',
  58: '兌 (Dui) - The Joyous (Lake) / Open (喜び・沢)',
  63: '既濟 (Ji Ji) - After Completion / Already Fording (完成・秩序)',
  64: '未濟 (Wei Ji) - Before Completion / Not Yet Fording (未完成・希望)',
};

export function getLifePathNumber(birthDate: Date): NumerologyData {
  const year = birthDate.getFullYear();
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();

  const reduceNumber = (num: number): number => {
    if (num === 11 || num === 22 || num === 33) return num;
    let sum = 0;
    let temp = num;
    while (temp > 0) {
      sum += temp % 10;
      temp = Math.floor(temp / 10);
    }
    if (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
      return reduceNumber(sum);
    }
    return sum;
  };

  const rYear = reduceNumber(year);
  const rMonth = reduceNumber(month);
  const rDay = reduceNumber(day);

  const total = rYear + rMonth + rDay;
  const finalNum = reduceNumber(total);

  const descriptions: Record<number, string> = {
    1: '開拓者 - 独立心、リーダーシップ、独創的な行動。【活用法】自分のペースで物事を進められる環境を選ぶと大成します。',
    2: 'パートナー - 協調性、外交力、直感的な調和。【活用法】コミュニティとのつながりが強い地域や、パートナーと過ごしやすい環境が吉です。',
    3: 'クリエイター - 自己表現、コミュニケーション、社交的な魅力。【活用法】文化やアート、エンタメの刺激が多い都市部がエネルギーを高めます。',
    4: 'ビルダー - 規律、構造、信頼性、勤勉さ。【活用法】インフラが整い、地に足の着いた生活ができる保守的なエリアが適しています。',
    5: 'エクスプローラー - 自由、適応力、変化、好奇心。【活用法】交通の便が良く、多拠点生活や旅行に行きやすい環境がベストです。',
    6: '育成者 - バランス、責任感、奉仕、芸術的センス。【活用法】自然が豊かで、家族やペットと穏やかに暮らせる環境を選んでください。',
    7: '探求者 - 分析、精神性、知恵、孤独。【活用法】自然に囲まれた静かな場所や、精神的にリトリートできる落ち着いた土地が吉です。',
    8: 'アチーバー - 野心、物質的成功、権威、カルマ。【活用法】ビジネスの中心地や、経済的・ステータス的に成長できる活気ある場所が向いています。',
    9: '人道主義者 - 思いやり、地球意識、創造的な完成。【活用法】多様な価値観が入り交じる国際的な街や、社会貢献活動が盛んなエリアが吉。',
    11: '直感者 (マスターナンバー) - 精神的洞察、高い感受性、啓示。【活用法】エネルギーが澄んだ土地（パワースポットの近く等）を選ぶと直感が冴え渡ります。',
    22: 'マスタービルダー (マスターナンバー) - 大規模な夢の現実的な具現化。【活用法】大規模なプロジェクトを回すための、交通・情報アクセスの良いハブ都市が適しています。',
    33: 'マスターティーチャー (マスターナンバー) - 利他主義、思いやり、精神的な導き。【活用法】人に教え、癒やすためのサロンを持てるような、平和で愛に満ちた土地が吉です。',
  };

  return {
    lifePathNumber: finalNum,
    description: descriptions[finalNum] || '未知のパス (Path of mystery)'
  };
}

// Helpers for the new systems

function getSunSign(birthDate: Date): string {
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '山羊座 (Capricorn)';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '水瓶座 (Aquarius)';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return '魚座 (Pisces)';
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '牡羊座 (Aries)';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '牡牛座 (Taurus)';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '双子座 (Gemini)';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '蟹座 (Cancer)';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '獅子座 (Leo)';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '乙女座 (Virgo)';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '天秤座 (Libra)';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '蠍座 (Scorpio)';
  return '射手座 (Sagittarius)';
}

function calculateHexagramFromLines(lines: number[]): number {
  const bits: number[] = lines.map(l => (l === 7 || l === 9 ? 1 : 0));
  const val = bits.reduce((acc, bit, idx) => acc + bit * Math.pow(2, idx), 0);
  const keys = Object.keys(ICHING_HEXAGRAMS_ROXY).map(Number);
  return keys[val % keys.length];
}

function getNineStarKi(birthDate: Date, currentDate: Date, useClassical: boolean = true) {
  const honmei = getHonmeiStar(birthDate);
  const yrStarNum = useClassical ? honmei.classical : honmei.physical;
  
  const starsMap = [
    "",
    "一白水星 (1-White Water)",
    "二黒土星 (2-Black Earth)",
    "三碧木星 (3-Blue/Green Thunder)",
    "四緑木星 (4-Green Wind)",
    "五黄土星 (5-Yellow Soil)",
    "六白金星 (6-White Heaven)",
    "七赤金星 (7-Red Lake)",
    "八白土星 (8-White Mountain)",
    "九紫火星 (9-Purple Fire)"
  ];
  
  const yearStar = starsMap[yrStarNum] || "五黄土星 (5-Yellow Soil)";
  
  const mStarNum = ((birthDate.getMonth() + yrStarNum) % 9) + 1;
  const monthStar = starsMap[mStarNum];
  
  const dayHash = currentDate.getDate() + currentDate.getMonth() * 31;
  const dStarNum = (dayHash % 9) + 1;
  const dayStar = starsMap[dStarNum];
  
  // Calculate dynamic Tendo direction
  const zodiacs = getCurrentZodiac(currentDate, 139.6917);
  const monthlyTendoMap: Record<string, string> = {
    '寅': '南', '卯': '南西', '辰': '北', '巳': '西',
    '午': '北西', '未': '東', '申': '北', '酉': '北東',
    '戌': '南', '亥': '東', '子': '南東', '丑': '西'
  };
  const tendoDirName = monthlyTendoMap[zodiacs.monthZodiac] || '西';
  
  return {
    yearStar,
    monthStar,
    dayStar,
    magicSquareLocation: "中宮 (Middle Palace)",
    dailyDirectionSafety: `本日の【${tendoDirName}方位】は天道（大吉）です。「南西」は暗剣殺（大凶）のため避けてください。【活用法】天道方位への移動は運気を高め、凶方位は思わぬトラブルを招きます。`,
    sourceInfo: "Nine Star Ki Magic Square API (9-cycle)"
  };
}

function getMayaTzolkin(birthDate: Date, currentDate: Date) {
  const baseDate = new Date("2012-12-21T00:00:00Z");
  
  const getKin = (d: Date): number => {
    const diffTime = d.getTime() - baseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    let kin = (diffDays + 4) % 260;
    if (kin <= 0) kin += 260;
    return kin;
  };
  
  const birthKin = getKin(birthDate);
  const currentKin = getKin(currentDate);
  
  const seals = [
    { name: "Imix (Red Dragon - 赤い竜)", glyph: "🐉", meaning: "育み、誕生、原初的な信頼。【活用法】新しいプロジェクトや移住に向けた最初の一歩を踏み出すのに最適です。" },
    { name: "Ik (White Wind - 白い風)", glyph: "💨", meaning: "コミュニケーション、呼吸、インスピレーション。【活用法】SNS発信や情報収集、意思疎通を活発に行うと道が開けます。" },
    { name: "Akbal (Blue Night - 青い夜)", glyph: "🌌", meaning: "豊かさ、直感、サンクチュアリ、夢。【活用法】直感を信じ、自分の内なる豊かさを感じるためのリラックス時間を取ってください。" },
    { name: "Kan (Yellow Seed - 黄色い種)", glyph: "🌱", meaning: "開花、気づき、ターゲット、潜在能力。【活用法】未来に向けた計画の種まき（物件探しや下見）に非常に適した日です。" },
    { name: "Chicchan (Red Serpent - 赤い蛇)", glyph: "🐍", meaning: "生命力、本能、生存、身体的知恵。【活用法】頭で考えるよりも、その土地に行った時の「身体の感覚」を重視して判断してください。" },
    { name: "Cimi (White Worldbridger - 白い世界の橋渡し)", glyph: "橋", meaning: "降伏、解放、死と再生、機会。【活用法】古いこだわりや条件を手放すことで、本当に必要な良縁と繋がれる日です。" },
    { name: "Manik (Blue Hand - 青い手)", glyph: "✋", meaning: "癒し、達成、知る、行動。【活用法】自分の手で実際に行動すること（現地に足を運ぶ、自作する）が運気を高めます。" },
    { name: "Lamat (Yellow Star - 黄色い星)", glyph: "⭐", meaning: "美しさ、優雅さ、芸術、調和。【活用法】デザインや美意識を満たす環境、景観の美しい場所を選ぶと運気が上昇します。" },
    { name: "Muluc (Red Moon - 赤い月)", glyph: "💧", meaning: "流れ、浄化、感情の記憶。【活用法】水辺の環境や、過去の感情を浄化できるようなリフレッシュスポットに縁があります。" },
    { name: "Oc (White Dog - 白い犬)", glyph: "🐕", meaning: "忠誠心、愛、仲間、精神的な導き。【活用法】信頼できる家族やパートナー、あるいはペットとの絆を深める選択が吉です。" },
    { name: "Chuen (Blue Monkey - 青い猿)", glyph: "🐒", meaning: "遊び心、魔法、幻想、インナーチャイルド。【活用法】難しく考えず、ゲーム感覚で楽しんで物件やプランを探してみてください。" },
    { name: "Eb (Yellow Human - 黄色い人)", glyph: "👤", meaning: "知恵、自由意志、選択、器。【活用法】誰かの意見ではなく、自分自身の「自由意志」で最終的な決断を下すことが重要です。" },
    { name: "Ben (Red Skywalker - 赤い空歩く人)", glyph: "🚶", meaning: "探求、空間、タイムトラベラー、勇気。【活用法】これまで縁のなかった見知らぬ土地を探索するのに最適なエネルギーです。" },
    { name: "Ix (White Wizard - 白い魔法使い)", glyph: "🧙", meaning: "受容性、永遠、誠実さ、魔法。【活用法】流れに身を委ね、「待ち」の姿勢でいると思わぬ良い物件やご縁が舞い込みます。" },
    { name: "Men (Blue Eagle - 青い鷲)", glyph: "🦅", meaning: "ビジョン、心、創造、俯瞰的視点。【活用法】目先の条件にとらわれず、5年後10年後の未来を見据えた高い視点から判断してください。" },
    { name: "Cib (Yellow Warrior - 黄色い戦士)", glyph: "🛡️", meaning: "信頼、宇宙の知性、問う者。【活用法】妥協せず、不動産業者や関係者に恐れず疑問を投げかけることで真実が見えます。" },
    { name: "Caban (Red Earth - 赤い地球)", glyph: "🌍", meaning: "進化、ナビゲーション、シンクロニシティ、グラウンディング。【活用法】偶然のシンクロ（タイミングの一致）に従うと、運命の土地に導かれます。" },
    { name: "Etznab (White Mirror - 白い鏡)", glyph: "🪞", meaning: "映し出すこと、真実、明晰さ、幻想を打破する。【活用法】自分をごまかさず、本当に求めている条件をクリアにリストアップしてください。" },
    { name: "Cauac (Blue Storm - 青い嵐)", glyph: "⛈️", meaning: "自己発生、エネルギー変換、活性化。【活用法】環境を大きく変え、現状を打破するパワフルな移住に圧倒的な後押しがあります。" },
    { name: "Ahau (Yellow Sun - 黄色い太陽)", glyph: "☀️", meaning: "啓蒙、普遍的な火、アセンション、王冠。【活用法】すべてが明白になり、感謝の気持ちで満たされます。直感的な「Yes」に従ってください。" }
  ];
  
  const tones = [
    { tone: 1, name: "Hun (Magnetic - 磁気の)", power: "目的と統一性を引き寄せる。【活用法】計画の軸を定め、目標に集中してください。" },
    { tone: 2, name: "Ka (Polar - 月の)", power: "挑戦と極性を安定させる。【活用法】迷いや二極化が生じやすいですが、それを受け入れて選択肢を絞り込んでください。" },
    { tone: 3, name: "Ox (Electric - 電気の)", power: "奉仕と絆を活性化する。【活用法】誰かのため、あるいはコミュニティへの貢献を意識するとスムーズに進みます。" },
    { tone: 4, name: "Kan (Self-Existing - 自己存在の)", power: "形と尺度を定義する。【活用法】予算や広さなど、具体的な条件・フォーマットを確定させるのに最適です。" },
    { tone: 5, name: "Ho (Overtone - 倍音の)", power: "輝きと指揮を力づける。【活用法】自分自身がリーダーシップを取り、主体的に計画を推進してください。" },
    { tone: 6, name: "Uac (Rhythmic - 律動の)", power: "平等と流れをバランスする。【活用法】仕事とプライベートのバランスが取れるような、調和の取れた選択を心がけてください。" },
    { tone: 7, name: "Uc (Resonant - 共振の)", power: "チャネルと調律を鼓舞する。【活用法】直感や宇宙からのサインを受け取りやすくなっています。瞑想やリラックスを。" },
    { tone: 8, name: "Uaxac (Galactic - 銀河の)", power: "完全性とモデルを構造化する。【活用法】自分自身の倫理観や信念に合致しているか、再度確認して行動してください。" },
    { tone: 9, name: "Bolon (Solar - 太陽の)", power: "意図と脈動を実現する。【活用法】情熱を持って、具体的な行動（内見や契約）に移すための強力な後押しがあります。" },
    { tone: 10, name: "Lahun (Planetary - 惑星の)", power: "完璧さと生産を現れさせる。【活用法】これまでの準備が形になりやすい時です。具現化にフォーカスしてください。" },
    { tone: 11, name: "Buluc (Spectral - スペクトルの)", power: "解放、溶解、自由。【活用法】不要な条件やこだわりを手放すことで、本当に自由な生活を手に入れられます。" },
    { tone: 12, name: "Lahca (Crystal - 水晶の)", power: "協力と献身を普遍化する。【活用法】周囲の人々と協力し、情報を共有し合うことで最適な答えが見つかります。" },
    { tone: 13, name: "Oxlahun (Cosmic - 宇宙の)", power: "存在を越え、持続する。【活用法】ひとつのサイクルが完了します。感謝とともに次のステージへの飛躍を受け入れてください。" }
  ];
  
  const sealIdx = (currentKin - 1) % 20;
  const toneIdx = (currentKin - 1) % 13;
  
  const birthSealIdx = (birthKin - 1) % 20;
  const birthToneIdx = (birthKin - 1) % 13;
  
  const dailyGuidance = `本日のキンナンバーはKin ${currentKin}（${seals[sealIdx].name}、音${tones[toneIdx].tone}）です。あなたの誕生キンはKin ${birthKin}（${seals[birthSealIdx].name}、音${tones[birthToneIdx].tone}）です。【活用法】今日の宇宙のリズム（${seals[sealIdx].name}）と自身の生まれ持つ特性を掛け合わせ、行動の指針として活用してください。`;
  
  return {
    kinNumber: currentKin,
    solarSeal: seals[sealIdx],
    galacticTone: tones[toneIdx],
    dailyGuidance,
    sourceInfo: "Maya Tzolkin Sacred Calendar (260-day cycle)"
  };
}

function getKabbalahTree(birthDate: Date, currentDate: Date) {
  const sephiras = [
    { name: "Keter (ケテル/王冠)", meaning: "無限の光、神聖な意志、根源的な源" },
    { name: "Chokhmah (コクマー/知恵)", meaning: "直感的な閃き、純粋な可能性、能動的な力" },
    { name: "Binah (ビナー/理解)", meaning: "知的な構造、形を生み出す母なる子宮" },
    { name: "Chesed (ケセド/慈悲)", meaning: "無条件の愛、拡大する恩恵と寛容さ" },
    { name: "Gevurah (ゲブラー/峻厳)", meaning: "規律、判断、制限、境界線" },
    { name: "Tiferet (ティファレト/美・調和)", meaning: "思いやりのあるバランス、ハートセンター、エゴの統合" },
    { name: "Netzach (ネツァク/勝利)", meaning: "感情的な衝動、欲望、創造的な表現" },
    { name: "Hod (ホド/栄光)", meaning: "知性、コミュニケーション、体系的な構造" },
    { name: "Yesod (イェソド/基礎)", meaning: "潜在意識、アストラル領域、生命の繋がり" },
    { name: "Malkuth (マルクト/王国)", meaning: "物理的な現実化、グラウンディング、積極的な実行" }
  ];
  
  const hebrewLetters = ["Aleph", "Bet", "Gimel", "Dalet", "He", "Vav", "Zayin", "Het", "Tet", "Yod", "Kaph", "Lamed", "Mem", "Nun", "Samekh", "Ayin", "Pe", "Tsadi", "Qoph", "Resh", "Shin", "Tav"];
  
  const dayString = currentDate.toISOString().split('T')[0];
  const rand = createRand(dayString);
  
  const activeIdx = Math.floor(rand() * sephiras.length);
  const letterIdx = Math.floor(rand() * hebrewLetters.length);
  
  const birthNum = birthDate.getDate() + birthDate.getMonth();
  const pathNum = ((birthNum + activeIdx + letterIdx) % 22) + 1;
  
  const activeSephirah = sephiras[activeIdx].name;
  const pathOfResonance = `Path ${pathNum} (${hebrewLetters[letterIdx]})`;
  
  return {
    activeSephirah,
    pathOfResonance,
    hebrewLetter: hebrewLetters[letterIdx],
    dailyVibrationScore: Math.floor(50 + rand() * 50),
    insight: `現在は「${sephiras[activeIdx].meaning}」のエネルギーと共鳴しています。【活用法】本日は自身の内なる ${activeSephirah} の質を意識し、拡大（ケセド）と制限（ゲブラー）のバランスを取ることで、計画を最もスムーズに現実化（マルクト）できます。`,
    sourceInfo: "Kabbalah Tree of Life Integration Engine"
  };
}

function getHumanDesign(birthDate: Date, currentDate: Date) {
  const chartTypes = ["プロジェクター (Projector)", "ジェネレーター (Generator)", "マニフェスティング・ジェネレーター (Manifesting Generator)", "マニフェスター (Manifestor)", "リフレクター (Reflector)"];
  const authorities = ["感情権威 (Emotional)", "仙骨権威 (Sacral)", "直感権威 (Splenic)", "エゴ権威 (Ego)", "自己プロジェクター権威 (Self-Projected)", "精神プロジェクター権威 (Mental Projected)", "月周期 (Lunar Cycle)"];
  const profiles = ["1/3 (研究者/殉教者)", "2/4 (隠者/日和見主義者)", "3/5 (殉教者/異端者)", "4/6 (日和見主義者/模範)", "5/1 (異端者/研究者)", "6/2 (模範/隠者)"];
  
  const birthString = birthDate.toISOString();
  const brand = createRand(birthString);
  
  const typeIdx = Math.floor(brand() * chartTypes.length);
  const authIdx = Math.min(authorities.length - 1, Math.floor(brand() * authorities.length));
  const profIdx = Math.floor(brand() * profiles.length);
  
  const dayString = currentDate.toISOString().split('T')[0];
  const drand = createRand(dayString);
  const todayGate = Math.floor(drand() * 64) + 1;
  const gateMeaning = `ゲート ${todayGate} (太陽/地球のトランジットにより活性化)。【活用法】現在アクティブなゲートの特性が環境全体に影響を与えています。あなた自身の意思決定オーソリティ（${authorities[authIdx]}）に従って判断してください。`;
  
  return {
    chartType: chartTypes[typeIdx],
    authority: authorities[authIdx],
    profile: profiles[profIdx],
    activeChannels: [`Channel ${Math.floor(brand() * 36) + 1}-${Math.floor(brand() * 36) + 1}`],
    dailyGateActivation: gateMeaning,
    sourceInfo: "Human Design Synthesis Engine"
  };
}

function getGeomancy(currentDate: Date) {
  const figures = [
    { name: "Via (道)", points: [1, 1, 1, 1], element: "水", astro: "蟹座の月", meaning: "動き、変化、シンプルさ、直線的な進行" },
    { name: "Cauda Draconis (竜の尾)", points: [2, 2, 1, 1], element: "火", astro: "サウスノード", meaning: "終わり、損失、解放、出口、カルマの解消" },
    { name: "Caput Draconis (竜の頭)", points: [1, 1, 2, 2], element: "地", astro: "ノースノード", meaning: "始まり、獲得、入り口、ポジティブな縁" },
    { name: "Puer (少年)", points: [1, 1, 2, 1], element: "火", astro: "牡羊座の火星", meaning: "活発なエネルギー、競争、衝動性、対立" },
    { name: "Puella (少女)", points: [1, 2, 1, 1], element: "風", astro: "天秤座の金星", meaning: "調和、美しさ、楽しい関係、受動性" },
    { name: "Albus (白)", points: [2, 2, 1, 2], element: "水", astro: "双子座の水星", meaning: "明晰さ、知恵、光、平和的な議論" },
    { name: "Rubeus (赤)", points: [2, 1, 2, 2], element: "火", astro: "蠍座の火星", meaning: "情熱、怒り、激しさ、高い強度" },
    { name: "Acquisitio (獲得)", points: [1, 2, 1, 2], element: "風", astro: "射手座の木星", meaning: "利益を得る、拡大、物質的な手に入れ" },
    { name: "Amissio (喪失)", points: [2, 1, 2, 1], element: "地", astro: "牡牛座の金星", meaning: "手放す、慈善、商業には不向き" },
    { name: "Fortuna Major (大吉)", points: [2, 2, 1, 1], element: "火", astro: "獅子座の太陽", meaning: "大きな成功、保護、内なる強さ" },
    { name: "Fortuna Minor (小吉)", points: [1, 1, 2, 2], element: "火", astro: "獅子座の太陽(弱)", meaning: "素早い成功、外部からの援助、一過性の幸運" },
    { name: "Conjunctio (結合)", points: [2, 1, 1, 2], element: "風", astro: "乙女座の水星", meaning: "出会い、契約、集会、繋がり" },
    { name: "Carcer (牢獄)", points: [1, 2, 2, 1], element: "地", astro: "山羊座の土星", meaning: "遅延、制限、構造、忍耐、安定性" },
    { name: "Tristitia (悲しみ)", points: [2, 2, 2, 1], element: "地", astro: "水瓶座の土星", meaning: "悲哀、構造、深い基礎、重力" },
    { name: "Laetitia (喜び)", points: [1, 2, 2, 2], element: "風", astro: "魚座の木星", meaning: "幸福、健康、上昇志向、お祝い" },
    { name: "Populus (群衆)", points: [2, 2, 2, 2], element: "水", astro: "蟹座の月(満月)", meaning: "大衆、集まり、受動性、反映" }
  ];
  
  const dayString = currentDate.toISOString().split('T')[0];
  const rand = createRand(dayString);
  
  const figIdx = Math.floor(rand() * figures.length);
  const figure = figures[figIdx];
  
  return {
    figureName: figure.name,
    binaryPoints: figure.points,
    element: figure.element,
    astrologicalAssociation: figure.astro,
    interpretation: `${figure.meaning}。【活用法】土占いの結果は大地からのダイレクトなサインです。結果が活動的であれば即断即決を、受動的・制限的であれば計画の再考や待機を推奨します。`,
    sourceInfo: "Medieval Geomantic Binary Cast API"
  };
}

function getZiWeiDouShu(birthDate: Date, currentDate: Date) {
  const majorStars = [
    "紫微 (Zi Wei - 帝王の星)", 
    "天府 (Tian Fu - 財庫の星)", 
    "天機 (Tian Ji - 知恵の星)", 
    "太陽 (Tai Yang - 太陽の星)", 
    "武曲 (Wu Qu - 財帛・行動の星)", 
    "天同 (Tian Tong - 調和・福の星)", 
    "廉貞 (Lian Zhen - 精神・複雑の星)", 
    "太陰 (Tai Yin - 月・不動産の星)", 
    "貪狼 (Tan Lang - 欲望・社交の星)", 
    "巨門 (Ju Men - 口舌・研究の星)", 
    "天梁 (Tian Liang - 庇護・長老の星)", 
    "七殺 (Qi Sha - 将軍・開拓の星)", 
    "破軍 (Po Jun - 破壊と再生の星)"
  ];
  
  const birthString = birthDate.toISOString();
  const brand = createRand(birthString);
  const selfIdx = Math.floor(brand() * majorStars.length);
  const bodyIdx = (selfIdx + 3) % majorStars.length;
  
  const dayString = currentDate.toISOString().split('T')[0];
  const drand = createRand(dayString);
  const flyIdx = Math.floor(drand() * majorStars.length);
  
  const palaces = ["命宮 (Self Palace)", "財帛宮 (Wealth Palace)", "官祿宮 (Career Palace)", "遷移宮 (Travel Palace)", "交友宮 (Friends Palace)", "田宅宮 (Property Palace)"];
  
  return {
    selfPalaceStar: majorStars[selfIdx],
    bodyPalaceStar: majorStars[bodyIdx],
    activeFlyingStar: majorStars[flyIdx],
    palacePosition: palaces[Math.floor(drand() * palaces.length)],
    dailyInsight: `飛星の「${majorStars[flyIdx]}」が本日あなたの「${palaces[Math.floor(drand() * palaces.length)]}」に入っています。【活用法】この星がもたらすテーマ（財、キャリア、人間関係など）が今日アクティブになります。該当領域での積極的な行動や情報収集が吉です。`,
    sourceInfo: "Zi Wei Dou Shu Star Placement Engine"
  };
}

export function fetchMetaphysicalData(
  birthDate: Date,
  currentDate: Date,
  personalBazi: BaziResult | null,
  useClassical: boolean = true
): MetaphysicalData {
  // Use date hashes for deterministic daily outputs
  const dayString = currentDate.toISOString().split('T')[0];
  const rand = createRand(dayString);

  // 1. DivineAPI
  // Tarot
  const tarotIdx = Math.floor(rand() * TAROT_DECK.length);
  const isReversed = rand() > 0.5;
  const rawCard = TAROT_DECK[tarotIdx];
  const tarot: TarotCard = {
    ...rawCard,
    orientation: isReversed ? '逆位置 (Reversed)' : '正位置 (Upright)' as any,
    riskModifier: isReversed ? -rawCard.riskModifier : rawCard.riskModifier, // reverse risk impact
    meaning: isReversed 
      ? `逆位置: エネルギーの滞り、内面へのフォーカス、またはカードの性質（${rawCard.meaning.split('。')[0]}）の極端な現れを意味します。${rawCard.meaning.split('。')[1]}`
      : `正位置: ${rawCard.meaning}`
  };

  // Numerology
  const numerology = getLifePathNumber(birthDate);

  // 2. AstrologyAPI
  const sunSign = getSunSign(birthDate);
  const horoscope = `本日の星回りによれば、${sunSign}の方にとって太陽のエネルギーと惑星の引力が調和し、長期的な戦略を立てるのに最適な日です。【活用法】直感に頼るだけでなく、データに基づいた論理的な移住計画や投資判断を推し進めてください。`;
  const aspects: MetaphysicalData['astrologyApi']['aspects'] = [
    { aspect: '太陽 セクスタイル ネイタル火星 (Sun Sextile Natal Mars)', angle: 60, quality: 'harmonious' },
    { aspect: 'トランジット土星 スクエア ネイタル金星 (Transit Saturn Square Natal Venus)', angle: 90, quality: 'discordant' },
    { aspect: '木星 トライン ネイタル太陽 (Jupiter Trine Natal Sun)', angle: 120, quality: 'harmonious' }
  ];

  // 3. VedAstro
  const dashas = ['木星-土星期 (Jupiter-Saturn)', '木星-水星期 (Jupiter-Mercury)', '土星-土星期 (Saturn-Saturn)', '土星-水星期 (Saturn-Mercury)'];
  const activeDasha = dashas[Math.floor(rand() * dashas.length)] + ` (現在のアクティブ・サブ期間)`;
  const ashtakavargaPoints = {
    "太陽 (Sun)": 28 + Math.floor(rand() * 10),
    "月 (Moon)": 28 + Math.floor(rand() * 10),
    "火星 (Mars)": 20 + Math.floor(rand() * 15),
    "水星 (Mercury)": 25 + Math.floor(rand() * 12),
    "木星 (Jupiter)": 30 + Math.floor(rand() * 10),
    "金星 (Venus)": 25 + Math.floor(rand() * 15),
    "土星 (Saturn)": 20 + Math.floor(rand() * 15)
  };
  const planetaryStrengths = {
    "太陽 (Sun)": 1.1 + rand() * 0.3,
    "月 (Moon)": 0.9 + rand() * 0.4,
    "火星 (Mars)": 0.8 + rand() * 0.5,
    "土星 (Saturn)": 0.7 + rand() * 0.6
  };

  // 4. Chinese Metasoft
  const gateIdx = Math.floor(rand() * QI_MEN_GATES.length);
  const qiMenGate = QI_MEN_GATES[gateIdx];

  // Da Yun Luck Pillar Match
  let daYunPillar: MetaphysicalData['chineseMetasoft']['daYunPillar'] = null;
  if (personalBazi && personalBazi.luckCycles) {
    const currentYear = currentDate.getFullYear();
    const activeCycle = personalBazi.luckCycles.find(
      c => currentYear >= c.startYear && currentYear <= c.endYear
    );
    if (activeCycle) {
      const birthYear = birthDate.getFullYear();
      daYunPillar = {
        pillar: activeCycle.ganZhi,
        startAge: activeCycle.startYear - birthYear,
        endAge: activeCycle.endYear - birthYear,
        description: `現在のアクティブな10年間の大運サイクルです。【活用法】人生の大きなテーマや方向性に強い影響を与えます。構造的な決断や中長期的な移住計画の軸として考慮してください。`
      };
    }
  }

  // 5. RoxyAPI (I-Ching coin casting with changing lines)
  // Throw 3 coins 6 times.
  // Coins value: head = 3, tail = 2. Sum range: 6 (3 tails), 7 (2 tails 1 head), 8 (2 heads 1 tail), 9 (3 heads)
  // 6: Old Yin (changing to Yang)
  // 7: Young Yang (stable)
  // 8: Young Yin (stable)
  // 9: Old Yang (changing to Yin)
  const lines: number[] = [];
  const changingLines: number[] = [];
  for (let i = 0; i < 6; i++) {
    const throwSum = 6 + Math.floor(rand() * 4); // 6, 7, 8, or 9
    lines.push(throwSum);
    if (throwSum === 6 || throwSum === 9) {
      changingLines.push(i + 1); // 1-indexed line number
    }
  }

  const primaryNum = calculateHexagramFromLines(lines);
  const primaryName = ICHING_HEXAGRAMS_ROXY[primaryNum] || '63: 既濟 (Ji Ji) - After Completion';

  let relatingHexagram = null;
  if (changingLines.length > 0) {
    const transformedLines = lines.map(l => {
      if (l === 6) return 7; // Yin changes to Yang
      if (l === 9) return 8; // Yang changes to Yin
      return l;
    });
    const relatingNum = calculateHexagramFromLines(transformedLines);
    relatingHexagram = {
      number: relatingNum,
      name: ICHING_HEXAGRAMS_ROXY[relatingNum] || '64: 未濟 (Wei Ji) - Before Completion'
    };
  }

  const interpretation = changingLines.length > 0 
    ? `得卦（メインの卦）は第${primaryNum}卦、之卦（変化後の卦）は第${relatingHexagram?.number}卦へ、変爻は[${changingLines.join(', ')}]です。動的な移行期にあります。【活用法】状況が変化しやすい時期です。移住や大きな決断は、周囲の環境変化を慎重に見極めてから進めてください。`
    : `安定した第${primaryNum}卦を得ました。変爻はありません。【活用法】現在の状態が強固です。既存の計画や安定した基盤に沿って、着実に移住・行動を進めるのが吉です。`;

  // 6. Build the extended systems
  const ziWeiDouShu = getZiWeiDouShu(birthDate, currentDate);
  const nineStarKi = getNineStarKi(birthDate, currentDate, useClassical);
  const mayaTzolkin = getMayaTzolkin(birthDate, currentDate);
  const kabbalahTree = getKabbalahTree(birthDate, currentDate);
  const humanDesign = getHumanDesign(birthDate, currentDate);
  const geomancy = getGeomancy(currentDate);

  return {
    divineApi: {
      tarot,
      numerology,
      sourceInfo: "DivineAPI (Tarot Drawing & Numerology Services)"
    },
    astrologyApi: {
      horoscope,
      aspects,
      sourceInfo: "AstrologyAPI / Online Astrology Software Core Engine"
    },
    vedAstro: {
      activeDasha,
      ashtakavargaPoints,
      planetaryStrengths,
      sourceInfo: "VedAstro MCP REST Engine (Vedic Astrology Client)"
    },
    chineseMetasoft: {
      qiMenGate,
      daYunPillar,
      sourceInfo: "Chinese Metasoft API / Luck Pillars API / KlavisAI Bazi Calculator MCP"
    },
    roxyApi: {
      ichingCast: {
        hexagramNumber: primaryNum,
        name: primaryName,
        lines,
        changingLines,
        relatingHexagram,
        interpretation
      },
      sourceInfo: "RoxyAPI - I-Ching API / strobus/i-ching Node.js API"
    },
    ziWeiDouShu,
    nineStarKi,
    mayaTzolkin,
    kabbalahTree,
    humanDesign,
    geomancy
  };
}
