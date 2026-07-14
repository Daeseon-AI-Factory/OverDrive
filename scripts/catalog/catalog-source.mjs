const EFFECTIVE_AT = '2026-07-14T00:00:00Z';
export const EVIDENCE_ID = 'catalog-v1-source-check-2026-07-14';

export const STRENGTH_SOURCE_REFS = [
  {
    sourceType: 'peer_reviewed',
    label:
      'American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/',
    license: null,
    accessedAt: EFFECTIVE_AT,
  },
  {
    sourceType: 'peer_reviewed',
    label: 'Resistance Exercise Training in Individuals With and Without Cardiovascular Disease: 2023 Update',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11209834/',
    license: null,
    accessedAt: EFFECTIVE_AT,
  },
];

export const CARDIO_SOURCE_REFS = [
  {
    sourceType: 'official_guideline',
    label: 'HHS Physical Activity Guidelines for Americans, 2nd Edition',
    url: 'https://odphp.health.gov/paguidelines/second-edition/pdf/Physical_Activity_Guidelines_2nd_edition.pdf',
    license: null,
    accessedAt: EFFECTIVE_AT,
  },
];

export const SOURCE_CHECK_EVIDENCE = {
  evidenceId: EVIDENCE_ID,
  reviewStatus: 'source_checked',
  reviewMethod: 'source_comparison',
  reviewedByRole: 'catalog-source-check-agent',
  reviewedAt: EFFECTIVE_AT,
  humanReviewed: false,
  scope: [
    'Neutral exercise identity, body-region taxonomy, equipment class, movement pattern, difficulty label, and logging defaults.',
    'ACSM/AHA are used only for strength rows and general resistance-training taxonomy and neutral prescription ranges.',
    'HHS Physical Activity Guidelines are used only for cardio activity classification; modality names and aliases remain original metadata.',
    'Names and aliases are independently authored catalog metadata and are not copied from the cited papers.',
  ],
  exclusions: [
    'Descriptions, instructions, coaching text, medical or diagnostic claims, images, and video.',
    'OpenStax content, wger bulk imports, and any proprietary exercise copy.',
    'Human editorial approval or endorsement.',
  ],
  sources: {
    strength: STRENGTH_SOURCE_REFS,
    cardio: CARDIO_SOURCE_REFS,
  },
};

const loc = (en, enAlias, ko, koAlias, es, esAlias, zhHans, zhHansAlias) => ({
  en: { displayName: en, aliases: [enAlias] },
  ko: { displayName: ko, aliases: [koAlias] },
  es: { displayName: es, aliases: [esAlias] },
  'zh-Hans': { displayName: zhHans, aliases: [zhHansAlias] },
});

const reps = (sets, low, high) => ({
  sets,
  trackingMode: 'reps',
  target: { unit: 'reps', low, high },
});

const duration = (sets = 1) => ({ sets, trackingMode: 'duration', target: null });
const durationDistance = () => ({ sets: 1, trackingMode: 'duration_distance', target: null });

const row = (
  id,
  localizations,
  exerciseType,
  isBodyweight,
  requiredEquipment,
  optionalEquipment,
  movementPattern,
  difficulty,
  primaryBodyRegions,
  secondaryBodyRegions,
  defaultPrescription,
) => ({
  id,
  localizations,
  exerciseType,
  isBodyweight,
  requiredEquipment,
  optionalEquipment,
  movementPattern,
  difficulty,
  primaryBodyRegions,
  secondaryBodyRegions,
  defaultPrescription,
});

const ROWS = [
  row(
    'barbell_bench_press',
    loc('Barbell Bench Press', 'Bench Press', '바벨 벤치프레스', '바벨 벤치', 'Press de banca con barra', 'Banca con barra', '杠铃卧推', '平板杠铃推举'),
    'strength', false, ['barbell', 'bench'], ['rack'], 'horizontal_push', 'intermediate', ['chest'], ['triceps', 'shoulders'], reps(3, 5, 8),
  ),
  row(
    'incline_db_press',
    loc('Incline Dumbbell Press', 'Incline DB Bench', '인클라인 덤벨 프레스', '윗가슴 덤벨 프레스', 'Press inclinado con mancuernas', 'Press superior con mancuernas', '上斜哑铃推举', '上斜哑铃卧推'),
    'strength', false, ['dumbbell', 'bench'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 12),
  ),
  row(
    'overhead_press',
    loc('Overhead Press', 'Standing Barbell Press', '오버헤드 프레스', '밀리터리 프레스', 'Press sobre la cabeza', 'Press de hombros con barra', '站姿推举', '杠铃肩推'),
    'strength', false, ['barbell'], ['rack'], 'vertical_push', 'intermediate', ['shoulders'], ['triceps', 'core'], reps(3, 5, 8),
  ),
  row(
    'lateral_raise',
    loc('Lateral Raise', 'Side Raise', '사이드 레터럴 레이즈', '사레레', 'Elevaciones laterales', 'Aperturas laterales', '侧平举', '哑铃侧举'),
    'strength', false, ['dumbbell'], [], 'shoulder_abduction', 'beginner', ['shoulders'], [], reps(3, 12, 20),
  ),
  row(
    'pull_up',
    loc('Pull-Up', 'Overhand Pull-Up', '풀업', '턱걸이', 'Dominada', 'Dominada pronada', '引体向上', '正手引体'),
    'strength', true, ['pull_up_bar'], [], 'vertical_pull', 'intermediate', ['back'], ['biceps', 'core'], reps(3, 5, 12),
  ),
  row(
    'barbell_row',
    loc('Barbell Row', 'Bent-Over Row', '바벨 로우', '바벨 벤트오버 로우', 'Remo con barra', 'Remo inclinado', '杠铃划船', '俯身杠铃划船'),
    'strength', false, ['barbell'], [], 'horizontal_pull', 'intermediate', ['back'], ['biceps', 'core'], reps(3, 6, 10),
  ),
  row(
    'lat_pulldown',
    loc('Lat Pulldown', 'Cable Pulldown', '랫 풀다운', '랫풀', 'Jalón al pecho', 'Jalón dorsal', '高位下拉', '背阔肌下拉'),
    'strength', false, ['lat_pulldown_machine'], [], 'vertical_pull', 'beginner', ['back'], ['biceps'], reps(3, 8, 12),
  ),
  row(
    'db_curl',
    loc('Dumbbell Curl', 'Alternating Dumbbell Curl', '덤벨 컬', '덤벨 이두 컬', 'Curl con mancuernas', 'Curl de bíceps', '哑铃弯举', '哑铃二头弯举'),
    'strength', false, ['dumbbell'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12),
  ),
  row(
    'triceps_pushdown',
    loc('Triceps Pushdown', 'Cable Pressdown', '트라이셉 푸시다운', '케이블 푸시다운', 'Extensión de tríceps en polea', 'Jalón de tríceps', '三头下压', '绳索下压'),
    'strength', false, ['cable_machine'], [], 'elbow_extension', 'beginner', ['triceps'], [], reps(3, 10, 15),
  ),
  row(
    'barbell_back_squat',
    loc('Barbell Back Squat', 'High-Bar Back Squat', '바벨 백스쿼트', '백스쿼트', 'Sentadilla trasera con barra', 'Sentadilla con barra', '杠铃深蹲', '杠铃后蹲'),
    'strength', false, ['barbell', 'rack'], ['smith_machine'], 'squat', 'intermediate', ['quads', 'glutes'], ['core', 'hamstrings'], reps(3, 5, 8),
  ),
  row(
    'deadlift',
    loc('Deadlift', 'Conventional Deadlift', '데드리프트', '컨벤셔널 데드리프트', 'Peso muerto', 'Peso muerto convencional', '硬拉', '传统硬拉'),
    'strength', false, ['barbell'], [], 'hinge', 'intermediate', ['glutes', 'hamstrings', 'back'], ['core', 'quads'], reps(3, 3, 6),
  ),
  row(
    'romanian_deadlift',
    loc('Romanian Deadlift', 'Barbell RDL', '루마니안 데드리프트', '루마니안 데드', 'Peso muerto rumano', 'RDL con barra', '罗马尼亚硬拉', '罗马尼亚式硬拉'),
    'strength', false, ['barbell'], [], 'hinge', 'intermediate', ['hamstrings', 'glutes'], ['back', 'core'], reps(3, 8, 12),
  ),
  row(
    'leg_press',
    loc('Leg Press', '45-Degree Leg Press', '레그 프레스', '머신 레그 프레스', 'Prensa de piernas', 'Prensa inclinada', '腿举', '倒蹬机'),
    'strength', false, ['leg_press_machine'], [], 'knee_extension', 'beginner', ['quads'], ['glutes', 'hamstrings'], reps(3, 10, 15),
  ),
  row(
    'leg_curl',
    loc('Leg Curl', 'Hamstring Curl', '레그 컬', '햄스트링 컬', 'Curl femoral', 'Flexión de piernas', '腿弯举', '腘绳肌弯举'),
    'strength', false, ['leg_curl_machine'], [], 'knee_flexion', 'beginner', ['hamstrings'], ['calves'], reps(3, 10, 15),
  ),
  row(
    'bulgarian_split_squat',
    loc('Bulgarian Split Squat', 'Rear-Foot-Elevated Split Squat', '불가리안 스플릿 스쿼트', '불스스', 'Sentadilla búlgara', 'Zancada búlgara', '保加利亚分腿蹲', '后脚抬高分腿蹲'),
    'strength', false, ['dumbbell', 'bench'], [], 'lunge', 'intermediate', ['quads', 'glutes'], ['hamstrings', 'core'], reps(3, 8, 12),
  ),
  row(
    'standing_calf_raise',
    loc('Standing Calf Raise', 'Calf Raise Machine', '스탠딩 카프 레이즈', '스탠딩 카프', 'Elevación de gemelos de pie', 'Gemelos de pie', '站姿提踵', '站姿小腿提踵'),
    'strength', false, ['calf_raise_machine'], ['smith_machine'], 'ankle_plantar_flexion', 'beginner', ['calves'], [], reps(4, 10, 15),
  ),
  row(
    'hanging_leg_raise',
    loc('Hanging Leg Raise', 'Bar Leg Raise', '행잉 레그 레이즈', '행레레', 'Elevación de piernas en suspensión', 'Elevación colgado', '悬垂举腿', '吊杠举腿'),
    'strength', true, ['pull_up_bar'], [], 'hip_flexion', 'intermediate', ['core'], ['quads'], reps(3, 8, 15),
  ),
  row(
    'plank',
    loc('Plank', 'Forearm Plank', '플랭크', '엘보 플랭크', 'Plancha', 'Plancha de antebrazos', '平板支撑', '前臂平板'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_extension', 'beginner', ['core'], ['shoulders'], { sets: 3, trackingMode: 'duration', target: { unit: 'seconds', low: 30, high: 60 } },
  ),
  row(
    'cable_fly',
    loc('Cable Fly', 'Cable Crossover', '케이블 플라이', '케이블 크로스오버', 'Aperturas en polea', 'Cruce de poleas', '绳索夹胸', '龙门架夹胸'),
    'strength', false, ['cable_machine'], [], 'shoulder_horizontal_adduction', 'beginner', ['chest'], ['shoulders'], reps(3, 10, 15),
  ),
  row(
    'dips',
    loc('Dips', 'Parallel Bar Dips', '딥스', '평행봉 딥스', 'Fondos', 'Fondos en paralelas', '双杠臂屈伸', '双杠下压'),
    'strength', true, ['dip_bars'], [], 'horizontal_push', 'intermediate', ['chest', 'triceps'], ['shoulders'], reps(3, 6, 12),
  ),
  row(
    'face_pull',
    loc('Face Pull', 'Rope Face Pull', '페이스 풀', '로프 페이스 풀', 'Face pull', 'Tirón a la cara', '面拉', '绳索面拉'),
    'strength', false, ['cable_machine'], [], 'shoulder_external_rotation', 'beginner', ['shoulders', 'back'], ['biceps'], reps(3, 12, 20),
  ),
  row(
    'hammer_curl',
    loc('Hammer Curl', 'Neutral-Grip Curl', '해머 컬', '뉴트럴 그립 컬', 'Curl martillo', 'Curl neutro', '锤式弯举', '中立握弯举'),
    'strength', false, ['dumbbell'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12),
  ),
  row(
    'hip_thrust',
    loc('Hip Thrust', 'Barbell Hip Thrust', '힙 쓰러스트', '바벨 힙 쓰러스트', 'Empuje de cadera', 'Hip thrust con barra', '臀冲', '杠铃臀推'),
    'strength', false, ['barbell', 'bench'], ['smith_machine'], 'hip_extension', 'beginner', ['glutes'], ['hamstrings', 'core'], reps(3, 8, 15),
  ),
  row(
    'cable_crunch',
    loc('Cable Crunch', 'Kneeling Cable Crunch', '케이블 크런치', '로프 크런치', 'Crunch en polea', 'Crunch arrodillado', '绳索卷腹', '跪姿绳索卷腹'),
    'strength', false, ['cable_machine'], [], 'trunk_flexion', 'beginner', ['core'], [], reps(3, 10, 15),
  ),
  row(
    'outdoor_run',
    loc('Outdoor Run', 'Road Run', '러닝 (야외)', '야외 러닝', 'Correr al aire libre', 'Carrera exterior', '户外跑步', '公路跑'),
    'cardio', true, [], [], 'locomotion_run', 'beginner', [], [], durationDistance(),
  ),
  row(
    'treadmill_run',
    loc('Treadmill Run', 'Indoor Run', '트레드밀 러닝', '러닝머신 달리기', 'Carrera en cinta', 'Correr en cinta', '跑步机跑步', '室内跑步'),
    'cardio', true, ['treadmill'], [], 'locomotion_run', 'beginner', [], [], durationDistance(),
  ),
  row(
    'zone2_run',
    loc('Zone 2 Run', 'Easy Aerobic Run', 'Zone 2 러닝', '존투 러닝', 'Carrera Zona 2', 'Rodaje Zona 2', 'Zone 2 慢跑', '二区慢跑'),
    'cardio', true, [], ['treadmill'], 'locomotion_run', 'beginner', [], [], durationDistance(),
  ),
  row(
    'hiit_intervals',
    loc('HIIT Intervals', 'High-Intensity Intervals', 'HIIT 인터벌', '고강도 인터벌', 'Intervalos HIIT', 'Intervalos de alta intensidad', 'HIIT 间歇', '高强度间歇'),
    'cardio', true, [], ['bodyweight_space', 'treadmill', 'bicycle', 'rowing_machine'], 'interval_mixed', 'intermediate', [], [], duration(),
  ),
  row(
    'cycling',
    loc('Cycling', 'Bike Ride', '사이클', '자전거 타기', 'Ciclismo', 'Bicicleta', '骑行', '自行车'),
    'cardio', false, ['bicycle'], [], 'cycle', 'beginner', [], [], durationDistance(),
  ),
  row(
    'rowing',
    loc('Rowing Machine', 'Erg Row', '로잉머신', '실내 조정', 'Remo en máquina', 'Ergómetro de remo', '划船机', '室内划船'),
    'cardio', false, ['rowing_machine'], [], 'row_erg', 'beginner', [], [], durationDistance(),
  ),
  row(
    'jump_rope',
    loc('Jump Rope', 'Skipping Rope', '줄넘기', '줄넘기 운동', 'Saltar la cuerda', 'Comba', '跳绳', '跳绳训练'),
    'cardio', true, ['jump_rope'], [], 'jump', 'beginner', [], [], duration(),
  ),
  row(
    'incline_walk',
    loc('Incline Walk', 'Treadmill Hill Walk', '인클라인 워킹', '경사 걷기', 'Caminata inclinada', 'Caminar con pendiente', '坡度步行', '跑步机爬坡'),
    'cardio', true, ['treadmill'], [], 'locomotion_walk', 'beginner', [], [], durationDistance(),
  ),
  row(
    'dumbbell_bench_press',
    loc('Dumbbell Bench Press', 'Flat DB Press', '덤벨 벤치프레스', '덤벨 벤치', 'Press de banca con mancuernas', 'Banca con mancuernas', '哑铃卧推', '平板哑铃推举'),
    'strength', false, ['dumbbell', 'bench'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 12),
  ),
  row(
    'push_up',
    loc('Push-Up', 'Press-Up', '푸시업', '팔굽혀펴기', 'Flexión de brazos', 'Lagartija', '俯卧撑', '标准俯卧撑'),
    'strength', true, ['bodyweight_space'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders', 'core'], reps(3, 8, 15),
  ),
  row(
    'chest_press_machine',
    loc('Machine Chest Press', 'Seated Chest Press', '체스트 프레스 머신', '머신 체스트 프레스', 'Press de pecho en máquina', 'Prensa de pecho', '器械推胸', '坐姿推胸'),
    'strength', false, ['chest_press_machine'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 12),
  ),
  row(
    'pec_deck_fly',
    loc('Pec Deck Fly', 'Machine Fly', '펙덱 플라이', '버터플라이 머신', 'Aperturas en pec deck', 'Mariposa en máquina', '蝴蝶机夹胸', '器械飞鸟'),
    'strength', false, ['pec_deck_machine'], [], 'shoulder_horizontal_adduction', 'beginner', ['chest'], ['shoulders'], reps(3, 10, 15),
  ),
  row(
    'arnold_press',
    loc('Arnold Press', 'Rotating Shoulder Press', '아놀드 프레스', '회전 숄더 프레스', 'Press Arnold', 'Press con giro', '阿诺德推举', '旋转肩推'),
    'strength', false, ['dumbbell'], ['bench'], 'vertical_push', 'intermediate', ['shoulders'], ['triceps'], reps(3, 8, 12),
  ),
  row(
    'shoulder_press_machine',
    loc('Machine Shoulder Press', 'Seated Machine Press', '머신 숄더 프레스', '숄더 프레스 머신', 'Press de hombros en máquina', 'Prensa de hombros', '器械肩推', '坐姿肩推'),
    'strength', false, ['shoulder_press_machine'], [], 'vertical_push', 'beginner', ['shoulders'], ['triceps'], reps(3, 8, 12),
  ),
  row(
    'rear_delt_fly',
    loc('Reverse Pec Deck Fly', 'Rear Delt Machine Fly', '리버스 펙덱 플라이', '리어 델트 머신', 'Aperturas inversas en pec deck', 'Pájaros en máquina', '反向蝴蝶机飞鸟', '器械后束飞鸟'),
    'strength', false, ['pec_deck_machine'], [], 'horizontal_pull', 'beginner', ['shoulders', 'back'], [], reps(3, 12, 15),
  ),
  row(
    'assisted_pull_up',
    loc('Band-Assisted Pull-Up', 'Assisted Chin-Up', '밴드 어시스트 풀업', '밴드 턱걸이', 'Dominada asistida con banda', 'Dominada con goma', '弹力带辅助引体', '辅助引体'),
    'strength', true, ['pull_up_bar', 'resistance_band'], [], 'vertical_pull', 'beginner', ['back'], ['biceps', 'core'], reps(3, 6, 12),
  ),
  row(
    'seated_cable_row',
    loc('Seated Cable Row', 'Low Cable Row', '시티드 케이블 로우', '롱풀', 'Remo sentado en polea', 'Remo bajo', '坐姿绳索划船', '低位划船'),
    'strength', false, ['cable_machine'], [], 'horizontal_pull', 'beginner', ['back'], ['biceps'], reps(3, 8, 12),
  ),
  row(
    'single_arm_db_row',
    loc('One-Arm Dumbbell Row', 'Single-Arm DB Row', '원암 덤벨 로우', '한팔 덤벨 로우', 'Remo a una mano con mancuerna', 'Remo unilateral', '单臂哑铃划船', '单手哑铃划船'),
    'strength', false, ['dumbbell', 'bench'], [], 'horizontal_pull', 'beginner', ['back'], ['biceps', 'core'], reps(3, 8, 12),
  ),
  row(
    'straight_arm_pulldown',
    loc('Straight-Arm Pulldown', 'Cable Pullover', '스트레이트 암 풀다운', '암 풀다운', 'Jalón con brazos rectos', 'Pullover en polea', '直臂下拉', '绳索直臂下压'),
    'strength', false, ['cable_machine'], [], 'vertical_pull', 'beginner', ['back'], ['triceps'], reps(3, 10, 15),
  ),
  row(
    'ez_bar_curl',
    loc('EZ-Bar Curl', 'EZ Curl', '이지바 컬', 'EZ바 이두 컬', 'Curl con barra EZ', 'Curl EZ', 'EZ 杠弯举', '曲杆弯举'),
    'strength', false, ['ez_curl_bar'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12),
  ),
  row(
    'overhead_triceps_extension',
    loc('Overhead Triceps Extension', 'Dumbbell French Press', '오버헤드 트라이셉스 익스텐션', '덤벨 프렌치 프레스', 'Extensión de tríceps sobre la cabeza', 'Press francés con mancuerna', '过头三头伸展', '哑铃颈后臂屈伸'),
    'strength', false, ['dumbbell'], [], 'elbow_extension', 'beginner', ['triceps'], ['shoulders'], reps(3, 10, 15),
  ),
  row(
    'front_squat',
    loc('Front Squat', 'Barbell Front Squat', '프론트 스쿼트', '앞스쿼트', 'Sentadilla frontal', 'Sentadilla con barra al frente', '杠铃前蹲', '前架深蹲'),
    'strength', false, ['barbell', 'rack'], [], 'squat', 'intermediate', ['quads'], ['glutes', 'core', 'back'], reps(3, 5, 8),
  ),
  row(
    'goblet_squat',
    loc('Goblet Squat', 'Kettlebell Goblet Squat', '고블릿 스쿼트', '케틀벨 스쿼트', 'Sentadilla goblet', 'Sentadilla copa', '高脚杯深蹲', '壶铃杯式深蹲'),
    'strength', false, ['kettlebell'], ['dumbbell'], 'squat', 'beginner', ['quads', 'glutes'], ['core'], reps(3, 8, 12),
  ),
  row(
    'hack_squat',
    loc('Hack Squat', 'Hack Squat Machine', '핵 스쿼트', '핵스쿼트 머신', 'Sentadilla hack', 'Prensa hack', '哈克深蹲', '哈克机深蹲'),
    'strength', false, ['hack_squat_machine'], [], 'squat', 'beginner', ['quads'], ['glutes', 'hamstrings'], reps(3, 8, 12),
  ),
  row(
    'leg_extension',
    loc('Leg Extension', 'Quad Extension', '레그 익스텐션', '대퇴사두 익스텐션', 'Extensión de piernas', 'Cuádriceps en máquina', '腿屈伸', '股四头肌伸展'),
    'strength', false, ['leg_extension_machine'], [], 'knee_extension', 'beginner', ['quads'], [], reps(3, 10, 15),
  ),
  row(
    'walking_lunge',
    loc('Walking Lunge', 'Forward Walking Lunge', '워킹 런지', '걷는 런지', 'Zancada caminando', 'Estocada andando', '行走弓步', '走步箭蹲'),
    'strength', true, ['bodyweight_space'], ['dumbbell'], 'lunge', 'beginner', ['quads', 'glutes'], ['hamstrings', 'core'], reps(3, 8, 12),
  ),
  row(
    'step_up',
    loc('Step-Up', 'Bench Step-Up', '스텝업', '박스 오르기', 'Subida al banco', 'Step-up en banco', '登台阶', '箱式踏步'),
    'strength', true, ['bench'], ['dumbbell'], 'step', 'beginner', ['quads', 'glutes'], ['hamstrings', 'calves'], reps(3, 8, 12),
  ),
  row(
    'trap_bar_deadlift',
    loc('Trap-Bar Deadlift', 'Hex-Bar Deadlift', '트랩바 데드리프트', '헥스바 데드', 'Peso muerto con barra hexagonal', 'Peso muerto trap bar', '六角杠硬拉', '六角杠铃硬拉'),
    'strength', false, ['trap_bar'], [], 'hinge', 'intermediate', ['glutes', 'quads', 'hamstrings'], ['back', 'core'], reps(3, 5, 8),
  ),
  row(
    'kettlebell_swing',
    loc('Kettlebell Swing', 'KB Swing', '케틀벨 스윙', 'KB 스윙', 'Balanceo con kettlebell', 'Swing con pesa rusa', '壶铃摆动', '壶铃甩摆'),
    'strength', false, ['kettlebell'], [], 'hinge', 'intermediate', ['glutes', 'hamstrings'], ['core', 'back'], reps(3, 10, 15),
  ),
  row(
    'glute_bridge',
    loc('Glute Bridge', 'Floor Hip Bridge', '글루트 브리지', '힙 브리지', 'Puente de glúteos', 'Puente de cadera', '臀桥', '地面臀桥'),
    'strength', true, ['bodyweight_space'], ['mat', 'weight_plate'], 'hip_extension', 'beginner', ['glutes'], ['hamstrings', 'core'], reps(3, 10, 15),
  ),
  row(
    'seated_calf_raise',
    loc('Seated Calf Raise', 'Calf Raise Seated', '시티드 카프 레이즈', '앉아서 카프', 'Elevación de gemelos sentado', 'Gemelos sentado', '坐姿提踵', '坐姿小腿提踵'),
    'strength', false, ['calf_raise_machine'], [], 'ankle_plantar_flexion', 'beginner', ['calves'], [], reps(3, 10, 15),
  ),
  row(
    'dead_bug',
    loc('Dead Bug', 'Alternating Dead Bug', '데드버그', '교차 데드버그', 'Dead bug', 'Bicho muerto', '死虫式', '交替死虫'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_extension', 'beginner', ['core'], [], reps(3, 8, 12),
  ),
  row(
    'side_plank',
    loc('Side Plank', 'Lateral Plank', '사이드 플랭크', '옆 플랭크', 'Plancha lateral', 'Plancha de lado', '侧平板支撑', '侧桥'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_lateral_flexion', 'beginner', ['core'], ['shoulders'], { sets: 3, trackingMode: 'duration', target: { unit: 'seconds', low: 20, high: 45 } },
  ),
  row(
    'pallof_press',
    loc('Pallof Press', 'Cable Anti-Rotation Press', '팔로프 프레스', '안티 로테이션 프레스', 'Press Pallof', 'Press antirotación', '帕洛夫推举', '抗旋转推举'),
    'strength', false, ['cable_machine'], [], 'trunk_anti_rotation', 'beginner', ['core'], ['shoulders'], reps(3, 8, 12),
  ),
  row(
    'russian_twist',
    loc('Russian Twist', 'Seated Twist', '러시안 트위스트', '시티드 트위스트', 'Giro ruso', 'Torsión rusa', '俄罗斯转体', '坐姿转体'),
    'strength', false, ['weight_plate'], ['mat'], 'trunk_rotation', 'beginner', ['core'], [], reps(3, 10, 20),
  ),
  row(
    'farmer_carry',
    loc('Farmer Carry', 'Farmer Walk', '파머스 캐리', '농부 걷기', 'Paseo del granjero', 'Caminata del granjero', '农夫行走', '农夫走'),
    'strength', false, ['dumbbell'], ['kettlebell', 'trap_bar'], 'loaded_carry', 'beginner', ['core'], ['shoulders', 'back', 'calves'], { sets: 3, trackingMode: 'distance', target: { unit: 'meters', low: 20, high: 40 } },
  ),
  row(
    'stair_climber',
    loc('Stair Climber', 'Stair Stepper', '계단 오르기 머신', '계단 머신', 'Máquina de escaleras', 'Escaladora', '登阶机', '楼梯机'),
    'cardio', false, ['stair_climber'], [], 'step', 'beginner', [], [], duration(),
  ),
  row(
    'elliptical',
    loc('Elliptical Trainer', 'Cross-Trainer', '일립티컬', '크로스 트레이너', 'Elíptica', 'Bicicleta elíptica', '椭圆机', '交叉训练机'),
    'cardio', false, ['elliptical_machine'], [], 'locomotion_walk', 'beginner', [], [], durationDistance(),
  ),
  row(
    'swimming',
    loc('Swimming', 'Pool Swim', '수영', '풀 스윔', 'Natación', 'Nado en piscina', '游泳', '泳池训练'),
    'cardio', true, ['pool'], [], 'locomotion_swim', 'beginner', [], [], durationDistance(),
  ),
  row(
    'single_leg_romanian_deadlift',
    loc('Single-Leg Romanian Deadlift', 'Single-Leg RDL', '싱글 레그 루마니안 데드리프트', '원레그 RDL', 'Peso muerto rumano a una pierna', 'RDL unilateral', '单腿罗马尼亚硬拉', '单腿 RDL'),
    'strength', false, ['dumbbell'], [], 'hinge', 'intermediate', ['hamstrings', 'glutes'], ['core', 'back'], reps(3, 8, 12),
  ),
];

export function buildCatalogSnapshot() {
  return {
    schemaVersion: '1.0.0',
    catalogVersion: '1.0.0',
    effectiveAt: EFFECTIVE_AT,
    defaultLocale: 'en',
    supportedLocales: ['en', 'ko', 'es', 'zh-Hans'],
    searchNormalization: 'search-v1',
    exercises: ROWS.map((source, index) => ({
      id: source.id,
      recordRevision: 1,
      status: 'active',
      effectiveFrom: EFFECTIVE_AT,
      effectiveTo: null,
      replacementId: null,
      displayOrder: index + 1,
      localizations: source.localizations,
      exerciseType: source.exerciseType,
      isBodyweight: source.isBodyweight,
      equipment: {
        required: source.requiredEquipment,
        optional: source.optionalEquipment,
      },
      movementPattern: source.movementPattern,
      difficulty: source.difficulty,
      primaryBodyRegions: source.primaryBodyRegions,
      secondaryBodyRegions: source.secondaryBodyRegions,
      defaultPrescription: source.defaultPrescription,
      provenance: {
        classification: 'original_editorial',
        reviewStatus: 'source_checked',
        reviewMethod: 'source_comparison',
        reviewedByRole: 'catalog-source-check-agent',
        reviewEvidence: EVIDENCE_ID,
        reviewedAt: EFFECTIVE_AT,
        containsThirdPartyCopy: false,
        sources: (source.exerciseType === 'strength'
          ? STRENGTH_SOURCE_REFS
          : CARDIO_SOURCE_REFS
        ).map((sourceRef) => ({ ...sourceRef })),
      },
    })),
  };
}
