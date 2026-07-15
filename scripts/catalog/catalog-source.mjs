const EFFECTIVE_AT = '2026-07-14T00:00:00Z';

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

export const REFERENCE_CONTEXT = {
  contextId: 'catalog-v1-program-safety-context-2026-07-14',
  purpose: 'program_and_safety_context_only',
  exerciseSpecificReview: false,
  humanReviewed: false,
  uses: [
    'General resistance-training program and safety context.',
    'General physical-activity and cardio program context.',
  ],
  limitations: [
    'These references were not compared exercise by exercise and are not row citations.',
    'They do not establish exercise-specific taxonomy, equipment, aliases, or prescriptions.',
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

const reps = (sets, low, high, countingConvention = 'total') => ({
  sets,
  trackingMode: 'reps',
  countingConvention,
  target: { unit: 'reps', low, high },
});

const duration = (sets = 1) => ({
  sets,
  trackingMode: 'duration',
  countingConvention: 'not_applicable',
  target: null,
});
const durationDistance = () => ({
  sets: 1,
  trackingMode: 'duration_distance',
  countingConvention: 'not_applicable',
  target: null,
});

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
    'strength', false, ['barbell'], ['rack'], 'vertical_push', 'intermediate', ['shoulders'], ['triceps'], reps(3, 5, 8),
  ),
  row(
    'lateral_raise',
    loc('Lateral Raise', 'Side Raise', '사이드 레터럴 레이즈', '사레레', 'Elevaciones laterales', 'Aperturas laterales', '侧平举', '哑铃侧举'),
    'strength', false, ['dumbbell'], [], 'shoulder_abduction', 'beginner', ['shoulders'], [], reps(3, 12, 20),
  ),
  row(
    'pull_up',
    loc('Pull-Up', 'Overhand Pull-Up', '풀업', '턱걸이', 'Dominada', 'Dominada pronada', '引体向上', '正手引体'),
    'strength', true, ['pull_up_bar'], [], 'vertical_pull', 'intermediate', ['back'], ['biceps'], reps(3, 5, 12),
  ),
  row(
    'barbell_row',
    loc('Barbell Row', 'Bent-Over Row', '바벨 로우', '바벨 벤트오버 로우', 'Remo con barra', 'Remo inclinado', '杠铃划船', '俯身杠铃划船'),
    'strength', false, ['barbell'], [], 'horizontal_pull', 'intermediate', ['back'], ['biceps'], reps(3, 6, 10),
  ),
  row(
    'lat_pulldown',
    loc('Lat Pulldown', 'Cable Pulldown', '랫 풀다운', '랫풀', 'Jalón al pecho', 'Jalón dorsal', '高位下拉', '背阔肌下拉'),
    'strength', false, ['lat_pulldown_machine'], [], 'vertical_pull', 'beginner', ['back'], ['biceps'], reps(3, 8, 12),
  ),
  row(
    'db_curl',
    loc('Dumbbell Curl', 'Alternating Dumbbell Curl', '덤벨 컬', '덤벨 이두 컬', 'Curl con mancuernas', 'Curl alterno con mancuernas', '哑铃弯举', '交替哑铃弯举'),
    'strength', false, ['dumbbell'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'triceps_pushdown',
    loc('Triceps Pushdown', 'Cable Pressdown', '트라이셉 푸시다운', '케이블 푸시다운', 'Extensión de tríceps en polea', 'Jalón de tríceps', '三头下压', '绳索下压'),
    'strength', false, ['cable_machine'], [], 'elbow_extension', 'beginner', ['triceps'], [], reps(3, 10, 15),
  ),
  row(
    'barbell_back_squat',
    loc('Barbell Back Squat', 'High-Bar Back Squat', '바벨 백스쿼트', '백스쿼트', 'Sentadilla trasera con barra', 'Sentadilla con barra', '杠铃深蹲', '杠铃后蹲'),
    'strength', false, ['barbell', 'rack'], [], 'squat', 'intermediate', ['quads', 'glutes'], [], reps(3, 5, 8),
  ),
  row(
    'deadlift',
    loc('Deadlift', 'Conventional Deadlift', '데드리프트', '컨벤셔널 데드리프트', 'Peso muerto', 'Peso muerto convencional', '硬拉', '传统硬拉'),
    'strength', false, ['barbell'], [], 'hinge', 'intermediate', ['glutes', 'hamstrings', 'back'], ['quads'], reps(3, 3, 6),
  ),
  row(
    'romanian_deadlift',
    loc('Romanian Deadlift', 'Barbell RDL', '루마니안 데드리프트', '루마니안 데드', 'Peso muerto rumano', 'RDL con barra', '罗马尼亚硬拉', '罗马尼亚式硬拉'),
    'strength', false, ['barbell'], [], 'hinge', 'intermediate', ['hamstrings', 'glutes'], [], reps(3, 8, 12),
  ),
  row(
    'leg_press',
    loc('Leg Press', '45-Degree Leg Press', '레그 프레스', '머신 레그 프레스', 'Prensa de piernas', 'Prensa inclinada', '腿举', '倒蹬机'),
    'strength', false, ['leg_press_machine'], [], 'squat', 'beginner', ['quads', 'glutes'], [], reps(3, 10, 15),
  ),
  row(
    'leg_curl',
    loc('Leg Curl', 'Hamstring Curl', '레그 컬', '햄스트링 컬', 'Curl femoral', 'Flexión de piernas', '腿弯举', '腘绳肌弯举'),
    'strength', false, ['leg_curl_station'], [], 'knee_flexion', 'beginner', ['hamstrings'], [], reps(3, 10, 15),
  ),
  row(
    'bulgarian_split_squat',
    loc('Bulgarian Split Squat', 'Rear-Foot-Elevated Split Squat', '불가리안 스플릿 스쿼트', '후면발 거상 스플릿 스쿼트', 'Sentadilla búlgara', 'Sentadilla con pie trasero elevado', '保加利亚分腿蹲', '后脚抬高分腿蹲'),
    'strength', false, ['rear_foot_support', 'external_resistance'], [], 'lunge', 'intermediate', ['quads', 'glutes'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'standing_calf_raise',
    loc('Standing Calf Raise', 'Standing Heel Raise', '스탠딩 카프 레이즈', '스탠딩 카프', 'Elevación de gemelos de pie', 'Gemelos de pie', '站姿提踵', '站姿小腿提踵'),
    'strength', false, ['external_resistance'], [], 'ankle_plantar_flexion', 'beginner', ['calves'], [], reps(4, 10, 15),
  ),
  row(
    'hanging_leg_raise',
    loc('Hanging Leg Raise', 'Bar Leg Raise', '행잉 레그 레이즈', '행레레', 'Elevación de piernas en suspensión', 'Elevación colgada de piernas', '悬垂举腿', '吊杠举腿'),
    'strength', true, ['pull_up_bar'], [], 'hip_flexion', 'intermediate', ['core'], [], reps(3, 8, 15),
  ),
  row(
    'plank',
    loc('Plank', 'Forearm Plank', '플랭크', '엘보 플랭크', 'Plancha', 'Plancha de antebrazos', '平板支撑', '前臂平板'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_extension', 'beginner', ['core'], [], { sets: 3, trackingMode: 'duration', countingConvention: 'total', target: { unit: 'seconds', low: 30, high: 60 } },
  ),
  row(
    'cable_fly',
    loc('Cable Fly', 'Cable Crossover', '케이블 플라이', '케이블 크로스오버', 'Aperturas en polea', 'Cruce de poleas', '绳索夹胸', '龙门架夹胸'),
    'strength', false, ['cable_machine'], [], 'shoulder_horizontal_adduction', 'beginner', ['chest'], ['shoulders'], reps(3, 10, 15),
  ),
  row(
    'dips',
    loc('Dips', 'Parallel Bar Dips', '딥스', '평행봉 딥스', 'Fondos', 'Fondos en paralelas', '双杠臂屈伸', '双杠撑体'),
    'strength', true, ['dip_bars'], [], 'vertical_push', 'intermediate', ['chest', 'triceps'], ['shoulders'], reps(3, 6, 12),
  ),
  row(
    'face_pull',
    loc('Face Pull', 'Rope Face Pull', '페이스 풀', '로프 페이스 풀', 'Face pull', 'Tirón a la cara', '面拉', '绳索面拉'),
    'strength', false, ['cable_machine'], [], 'shoulder_external_rotation', 'beginner', ['shoulders', 'back'], [], reps(3, 12, 20),
  ),
  row(
    'hammer_curl',
    loc('Hammer Curl', 'Neutral-Grip Curl', '해머 컬', '뉴트럴 그립 컬', 'Curl martillo', 'Curl neutro', '锤式弯举', '中立握弯举'),
    'strength', false, ['dumbbell'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'hip_thrust',
    loc('Hip Thrust', 'Loaded Hip Thrust', '힙 쓰러스트', '외부중량 힙 쓰러스트', 'Empuje de cadera', 'Empuje de cadera con carga', '臀推', '负重臀推'),
    'strength', false, ['upper_back_support', 'external_resistance'], [], 'hip_extension', 'beginner', ['glutes'], ['hamstrings'], reps(3, 8, 15),
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
    'cardio', true, [], [], 'locomotion_run', 'beginner', [], [], durationDistance(),
  ),
  row(
    'hiit_intervals',
    loc('HIIT Intervals', 'High-Intensity Intervals', 'HIIT 인터벌', '고강도 인터벌', 'Intervalos HIIT', 'Intervalos de alta intensidad', 'HIIT 间歇', '高强度间歇'),
    'cardio', true, [], [], 'interval_mixed', 'intermediate', [], [], duration(),
  ),
  row(
    'cycling',
    loc('Cycling', 'Bike Ride', '사이클', '자전거 타기', 'Ciclismo', 'Bicicleta', '骑行', '自行车'),
    'cardio', true, ['bicycle'], [], 'cycle', 'beginner', [], [], durationDistance(),
  ),
  row(
    'rowing',
    loc('Rowing Machine', 'Erg Row', '로잉머신', '실내 조정', 'Remo en máquina', 'Ergómetro de remo', '划船机', '室内划船'),
    'cardio', true, ['rowing_machine'], [], 'row_erg', 'beginner', [], [], durationDistance(),
  ),
  row(
    'jump_rope',
    loc('Jump Rope', 'Skipping Rope', '줄넘기', '줄넘기 운동', 'Saltar la cuerda', 'Comba', '跳绳', '跳绳训练'),
    'cardio', true, ['jump_rope'], [], 'jump', 'beginner', [], [], duration(),
  ),
  row(
    'incline_walk',
    loc('Incline Walk', 'Hill Walk', '인클라인 워킹', '경사 걷기', 'Caminata inclinada', 'Caminar en cuesta', '坡度步行', '坡路步行'),
    'cardio', true, [], [], 'locomotion_walk', 'beginner', [], [], durationDistance(),
  ),
  row(
    'dumbbell_bench_press',
    loc('Dumbbell Bench Press', 'Flat DB Press', '덤벨 벤치프레스', '덤벨 벤치', 'Press de banca con mancuernas', 'Banca con mancuernas', '哑铃卧推', '平板哑铃推举'),
    'strength', false, ['dumbbell', 'bench'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 12),
  ),
  row(
    'push_up',
    loc('Push-Up', 'Press-Up', '푸시업', '팔굽혀펴기', 'Flexión de brazos', 'Lagartija', '俯卧撑', '标准俯卧撑'),
    'strength', true, ['bodyweight_space'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 15),
  ),
  row(
    'chest_press_machine',
    loc('Machine Chest Press', 'Seated Chest Press', '체스트 프레스 머신', '머신 체스트 프레스', 'Press de pecho en máquina', 'Prensa de pecho', '器械推胸', '坐姿推胸'),
    'strength', false, ['chest_press_machine'], [], 'horizontal_push', 'beginner', ['chest'], ['triceps', 'shoulders'], reps(3, 8, 12),
  ),
  row(
    'machine_chest_fly',
    loc('Machine Chest Fly', 'Seated Chest Fly', '머신 체스트 플라이', '버터플라이 머신', 'Aperturas de pecho en máquina', 'Mariposa en máquina', '器械夹胸', '坐姿飞鸟'),
    'strength', false, ['chest_fly_machine'], [], 'shoulder_horizontal_adduction', 'beginner', ['chest'], ['shoulders'], reps(3, 10, 15),
  ),
  row(
    'rotating_dumbbell_press',
    loc('Standing Rotating Dumbbell Press', 'Rotating Shoulder Press', '스탠딩 회전 덤벨 프레스', '회전 숄더 프레스', 'Press rotacional de pie con mancuernas', 'Press con giro', '站姿旋转哑铃推举', '转腕肩推'),
    'strength', false, ['dumbbell'], [], 'vertical_push', 'intermediate', ['shoulders'], ['triceps'], reps(3, 8, 12),
  ),
  row(
    'shoulder_press_machine',
    loc('Machine Shoulder Press', 'Seated Machine Press', '머신 숄더 프레스', '숄더 프레스 머신', 'Press de hombros en máquina', 'Prensa de hombros', '器械肩推', '坐姿肩推'),
    'strength', false, ['shoulder_press_machine'], [], 'vertical_push', 'beginner', ['shoulders'], ['triceps'], reps(3, 8, 12),
  ),
  row(
    'machine_rear_delt_fly',
    loc('Machine Rear Delt Fly', 'Reverse Machine Fly', '머신 리어 델트 플라이', '리버스 머신 플라이', 'Aperturas posteriores en máquina', 'Pájaros en máquina', '器械后束飞鸟', '反向器械飞鸟'),
    'strength', false, ['dual_fly_machine'], [], 'horizontal_pull', 'beginner', ['shoulders', 'back'], [], reps(3, 12, 15),
  ),
  row(
    'assisted_pull_up',
    loc('Band-Assisted Pull-Up', 'Band-Assisted Overhand Pull-Up', '밴드 어시스트 풀업', '밴드 오버핸드 풀업', 'Dominada asistida con banda', 'Dominada pronada con banda', '弹力带辅助正手引体', '弹力带正手引体'),
    'strength', true, ['pull_up_bar', 'resistance_band'], [], 'vertical_pull', 'beginner', ['back'], ['biceps'], reps(3, 6, 12),
  ),
  row(
    'seated_cable_row',
    loc('Seated Cable Row', 'Low Cable Row', '시티드 케이블 로우', '롱풀', 'Remo sentado en polea', 'Remo bajo', '坐姿绳索划船', '低位划船'),
    'strength', false, ['cable_machine'], [], 'horizontal_pull', 'beginner', ['back'], ['biceps'], reps(3, 8, 12),
  ),
  row(
    'single_arm_db_row',
    loc('One-Arm Dumbbell Row', 'Single-Arm DB Row', '원암 덤벨 로우', '한팔 덤벨 로우', 'Remo a una mano con mancuerna', 'Remo unilateral', '单臂哑铃划船', '单手哑铃划船'),
    'strength', false, ['dumbbell', 'bench'], [], 'horizontal_pull', 'beginner', ['back'], ['biceps'], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'straight_arm_pulldown',
    loc('Straight-Arm Pulldown', 'Cable Pullover', '스트레이트 암 풀다운', '암 풀다운', 'Jalón con brazos rectos', 'Pullover en polea', '直臂下拉', '绳索直臂下压'),
    'strength', false, ['cable_machine'], [], 'vertical_pull', 'beginner', ['back'], [], reps(3, 10, 15),
  ),
  row(
    'angled_bar_curl',
    loc('Angled-Bar Curl', 'Cambered Bar Curl', '각도바 컬', '굴곡바 이두 컬', 'Curl con barra angular', 'Curl con barra curva', '曲杆弯举', '弯杆二头弯举'),
    'strength', false, ['angled_curl_bar'], [], 'elbow_flexion', 'beginner', ['biceps'], [], reps(3, 8, 12),
  ),
  row(
    'overhead_triceps_extension',
    loc('Overhead Triceps Extension', 'Two-Hand Dumbbell Extension', '오버헤드 트라이셉스 익스텐션', '양손 덤벨 익스텐션', 'Extensión de tríceps sobre la cabeza', 'Extensión con mancuerna a dos manos', '过头三头伸展', '双手哑铃臂屈伸'),
    'strength', false, ['dumbbell'], [], 'elbow_extension', 'beginner', ['triceps'], [], reps(3, 10, 15),
  ),
  row(
    'front_squat',
    loc('Front Squat', 'Barbell Front Squat', '프론트 스쿼트', '앞스쿼트', 'Sentadilla frontal', 'Sentadilla con barra al frente', '杠铃前蹲', '前架深蹲'),
    'strength', false, ['barbell', 'rack'], [], 'squat', 'intermediate', ['quads', 'glutes'], [], reps(3, 5, 8),
  ),
  row(
    'kettlebell_goblet_squat',
    loc('Kettlebell Goblet Squat', 'Kettlebell Cup Squat', '케틀벨 고블릿 스쿼트', '케틀벨 스쿼트', 'Sentadilla goblet con kettlebell', 'Sentadilla copa con pesa rusa', '壶铃高脚杯深蹲', '壶铃杯式深蹲'),
    'strength', false, ['kettlebell'], [], 'squat', 'beginner', ['quads', 'glutes'], [], reps(3, 8, 12),
  ),
  row(
    'sled_squat_machine',
    loc('Sled Squat Machine', 'Machine Sled Squat', '슬레드 스쿼트 머신', '머신 스쿼트', 'Sentadilla en trineo', 'Sentadilla guiada en máquina', '雪橇式深蹲机', '轨道深蹲机'),
    'strength', false, ['sled_squat_machine'], [], 'squat', 'beginner', ['quads', 'glutes'], [], reps(3, 8, 12),
  ),
  row(
    'leg_extension',
    loc('Leg Extension', 'Quad Extension', '레그 익스텐션', '대퇴사두 익스텐션', 'Extensión de piernas', 'Cuádriceps en máquina', '腿屈伸', '股四头肌伸展'),
    'strength', false, ['leg_extension_machine'], [], 'knee_extension', 'beginner', ['quads'], [], reps(3, 10, 15),
  ),
  row(
    'walking_lunge',
    loc('Walking Lunge', 'Forward Walking Lunge', '워킹 런지', '걷는 런지', 'Zancada caminando', 'Estocada andando', '行走弓步', '走步箭蹲'),
    'strength', true, ['bodyweight_space'], ['dumbbell'], 'lunge', 'beginner', ['quads', 'glutes'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'step_platform_step_up',
    loc('Step-Platform Step-Up', 'Platform Step-Up', '스텝 플랫폼 스텝업', '플랫폼 오르기', 'Subida a plataforma', 'Step-up en plataforma', '踏台阶', '平台踏步'),
    'strength', true, ['step_platform'], ['dumbbell'], 'step', 'beginner', ['quads', 'glutes'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'hex_bar_deadlift',
    loc('Hex-Bar Deadlift', 'Trap-Bar Deadlift', '헥스바 데드리프트', '트랩바 데드', 'Peso muerto con barra hexagonal', 'Peso muerto trap bar', '六角杠硬拉', '六角杠铃硬拉'),
    'strength', false, ['hex_bar'], [], 'hinge', 'intermediate', ['glutes', 'quads', 'hamstrings'], [], reps(3, 5, 8),
  ),
  row(
    'kettlebell_swing',
    loc('Kettlebell Swing', 'KB Swing', '케틀벨 스윙', 'KB 스윙', 'Balanceo con kettlebell', 'Swing con pesa rusa', '壶铃摆动', '壶铃甩摆'),
    'strength', false, ['kettlebell'], [], 'hinge', 'intermediate', ['glutes', 'hamstrings'], [], reps(3, 10, 15),
  ),
  row(
    'glute_bridge',
    loc('Glute Bridge', 'Floor Hip Bridge', '글루트 브리지', '힙 브리지', 'Puente de glúteos', 'Puente de cadera', '臀桥', '地面臀桥'),
    'strength', true, ['bodyweight_space'], ['mat', 'weight_plate'], 'hip_extension', 'beginner', ['glutes'], ['hamstrings'], reps(3, 10, 15),
  ),
  row(
    'seated_calf_raise',
    loc('Machine Seated Calf Raise', 'Seated Calf Raise', '머신 시티드 카프 레이즈', '앉아서 카프', 'Elevación de gemelos sentado en máquina', 'Gemelos sentado', '器械坐姿提踵', '坐姿小腿提踵'),
    'strength', false, ['calf_raise_machine'], [], 'ankle_plantar_flexion', 'beginner', ['calves'], [], reps(3, 10, 15),
  ),
  row(
    'dead_bug',
    loc('Dead Bug', 'Alternating Dead Bug', '데드버그', '교차 데드버그', 'Dead bug', 'Bicho muerto', '死虫式', '交替死虫'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_extension', 'beginner', ['core'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'side_plank_hip_lift',
    loc('Side-Plank Hip Lift', 'Lateral Plank Hip Raise', '사이드 플랭크 힙 리프트', '옆 플랭크 골반 들기', 'Elevación de cadera en plancha lateral', 'Plancha lateral con elevación', '侧平板提髋', '侧桥抬髋'),
    'strength', true, ['bodyweight_space'], ['mat'], 'trunk_anti_lateral_flexion', 'beginner', ['core'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'cable_anti_rotation_press',
    loc('Cable Anti-Rotation Press', 'Anti-Rotation Cable Press', '케이블 안티로테이션 프레스', '항회전 케이블 프레스', 'Press antirotación en polea', 'Empuje antirotación', '绳索抗旋转推举', '抗旋转绳索推'),
    'strength', false, ['cable_machine'], [], 'trunk_anti_rotation', 'beginner', ['core'], [], reps(3, 8, 12, 'per_side'),
  ),
  row(
    'seated_trunk_rotation',
    loc('Seated Plate Trunk Rotation', 'Plate Seated Twist', '플레이트 시티드 몸통 회전', '앉아서 몸통 회전', 'Rotación de tronco sentado con disco', 'Giro sentado con disco', '坐姿杠片转体', '坐姿躯干旋转'),
    'strength', false, ['weight_plate'], ['mat'], 'trunk_rotation', 'beginner', ['core'], [], reps(3, 10, 20, 'per_side'),
  ),
  row(
    'dumbbell_suitcase_march',
    loc('Dumbbell Suitcase March', 'One-Side Loaded March', '덤벨 수트케이스 마치', '한쪽 덤벨 제자리 걷기', 'Marcha unilateral con mancuerna', 'Marcha con carga a un lado', '单侧哑铃原地行走', '哑铃手提踏步'),
    'strength', false, ['dumbbell'], [], 'loaded_carry', 'beginner', ['core'], ['shoulders'], reps(3, 10, 20, 'per_side'),
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
    'dumbbell_single_leg_hip_hinge',
    loc('Dumbbell Single-Leg Hip Hinge', 'Single-Leg Dumbbell Hinge', '덤벨 싱글 레그 힙 힌지', '한발 덤벨 힙 힌지', 'Bisagra de cadera a una pierna con mancuerna', 'Bisagra unilateral con mancuerna', '哑铃单腿髋铰链', '单腿哑铃俯身'),
    'strength', false, ['dumbbell'], [], 'hinge', 'intermediate', ['hamstrings', 'glutes'], [], reps(3, 8, 12, 'per_side'),
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
        reviewStatus: 'unreviewed',
        reviewMethod: 'none',
        reviewedByRole: null,
        reviewEvidence: null,
        reviewedAt: null,
        containsThirdPartyCopy: false,
        sources: [],
      },
    })),
  };
}
