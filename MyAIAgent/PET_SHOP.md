# Pet Shop and Owned Companions (2026-10-29)

## 구매 규칙
- 코기만 기본 제공. 명랑이와 턱시도 고양이는 각각 500 Coins.
- 상점 Pets → Dogs/Cats에서 미리보기 후 공통 구매 확인창으로 구매한다. 구매가 끝나면 Character → Pets에 나타난다. 자동 장착하지 않는다.
- 기존 명랑이 선택·프리셋만으로 소유권을 지급하지 않는다. 미구매 선택은 코기로 대체하며 프리셋 내용은 보존한다. 미구매 펫 프리셋은 적용하지 않는다.
- 로컬은 기존 ShopState 저장에 pets를 추가하고, 계정은 economy_pets와 buy_pet RPC로 관리한다. PetCatalog를 가격·분류·이름·썸네일의 공통 기준으로 사용한다.
- 서버가 petShopReady를 제공하기 전에는 유료 펫 구매를 비활성화한다.

## 서버 적용
SQL Editor 쿼리 이름: **Pet Shop and Owned Companions**
파일: `supabase/migrations/202610290030_pet_shop.sql`. 028과 기존 재화/우편 마이그레이션 이후 실행한다. 사용자 실행 확인은 현재 대기 중이다.

500코인 차감과 소유권 저장은 같은 트랜잭션에서 처리한다. 중복 요청·재구매·잔액 부족·다른 계정 접근을 검사한다. 저장 trigger, 방 입장, 공원 입장, 친구 홈 방문, 간식 지급에서도 해당 계정의 소유권을 확인한다. 프리셋·기존 재화·가구·아이템·출석 우편은 유지한다.

## 턱시도 고양이 런타임 리소스
- 생성 도구: 내장 imagegen. 승인된 기존 고양이 행동 아트를 참고해 투명 atlas를 생성했다. 원본 참고 이미지는 수정하지 않았다.
- 보존 이미지: `Resources/Cat_Tuxedo_Runtime_Atlas.png`
- 배포 이미지: `public/assets/characters/tuxedo/atlas.png` (동일 PNG, 1536×1024, RGBA)
- 메타데이터: `Resources/Actions/tuxedo-frames.json`, `tuxedo-neck-anchors.json`. 배포 폴더의 frames.json / neck-anchors.json과 동일하게 유지한다.
- 6행×8포즈: idle, walk, run, jump, attack, emote. skill은 run, doubleJump/fall/land는 jump를 재사용한다. 기존 코기의 어택·대쉬 효과와 공통 옷장/애니메이션 컴포넌트를 공유한다.
- 공통 논리 캔버스 1024×1024, 발 기준 870. idle의 불투명 몸체 면적 기준으로 동작별 고정 배율을 산정하여 모션 중 급격한 확대를 막는다. 효과는 몸체 크기 산정에서 제외한다.
- 머리·목 anchor는 프레임마다 지정한다. walk/run/skill 머리는 추출 좌표보다 12px 위, 목은 18px 위, attack 목은 8px 위로 보정했다. 모자와 나비넥타이를 독립 재생한다.
- Pillow는 alpha/bbox/면적을 읽고 JSON을 작성하는 데만 사용했다. PNG를 재도색·크롭하지 않았다. alpha 0 배경의 RGB 색만 보고 불투명 배경으로 판단하지 않는다.
- 로비·캐릭터·싱글/멀티·공원·결과창·친구 홈에서 공통 PetCatalog와 AnimalConfig를 사용한다.

## 생성 프롬프트
Production sprite atlas derived from the input tuxedo cat. Preserve this exact cute black cat, white muzzle/chest/belly/white socks, orange eyes, proportions and fine 2D pixel-art look. Output clean REGULAR 8-column by 6-row atlas, 1536x1024, 48 isolated full-body frames, centred in equal 192x~170 cells, right facing, constant head/body size, at least 16px transparent margins. No overlap, text, labels, grid, cast shadows, props, hearts/question marks or action effects. Row 1 eight seated idle breathing/blink; row 2 eight walk; row 3 eight run; row 4 eight crouch/takeoff/rise/apex/descend/feet-forward/land/recover jump, feet local baseline (physics moves vertical); row 5 eight paw-swipe attack windup/swipe/follow-through/recover, no VFX; row 6 eight happy emotion head-tilt/blink/smile/recover, no turning away/icons. Existing input poses primary reference. Compact anatomy, 2D pixel, no 3D/backdrop/checkerboard. Transparent background.

## 검증
- 새 DB 통합 테스트 5개: 구매·계정 격리·중복 방지·저장/방/공원/친구 방문·간식·리소스 규격.
- 전체 테스트 343개 및 타입 검사·프로덕션 빌드 통과.
- 실제 Chrome: 미구매 인벤토리 코기 1종, 명랑이 구매 후 500코인, 고양이 추가 구매 후 0코인/총 3종, 자동 장착 없음, 잠긴 프리셋 거부, 6개 동작·옷장·플레이 화면 및 런타임 오류 없음 확인.

