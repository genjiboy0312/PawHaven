# 공통 장착 위치·크기 맞춤 — 2026-10-30

## 재사용 기준

- 새 아이템을 펫별로 다시 그리지 않는다. 한 장의 원본과 그림 안의 **실제 부착선 양 끝**을 등록한다. 투명 여백·매듭·천 끝을 목 너비로 취급하지 않는다.
- `AttachmentFit.ts`가 두 기준점 사이의 길이·각도를 동물의 부착선에 맞춰 등비 확대/축소·회전·이동한다. 가로만 늘려 문양을 왜곡하지 않는다.
- `head`는 모자, `neck`은 목 앞 나비넥타이, `collar`는 목을 두르는 스카프다. 서로 다른 기준을 억지로 공유하지 않는다.
- 기존 모자·나비넥타이도 같은 계산과 `applyAttachmentPose`를 사용한다. `PetPortrait`는 같은 pose의 anchor·회전을 사용한다. 기존 아이템 위치는 유지했다.

## 동물은 한 번, 아이템도 한 번

`CollarFits.ts`의 동물별 `x/y/width/rotation`은 각 프레임의 neck.width 기준 보정이다. 명랑이·코기·턱시도 고양이에 각각 등록했다. 프레임 이동은 기존 `neck-anchors.json`을 따르고 부모 Sprite가 몸 크기·좌우 반전·점프를 적용한다. 이 값은 이후 목 두름 장식 전체가 공유한다.

새 펫은 실제 프레임별 목 좌표와 collarFit을 한 번 보정해야 한다. 픽셀만 보고 목을 자동 인식하는 기능이 아니다. 보정 없는 펫은 임의 추정으로 collar를 출력하지 않는다.

새 목 두름 아이템은 원본 canvas의 폭·높이와 mount.back/front 좌표를 등록하고 attachment를 collar로 지정한다. `Wearable.mount`를 생략한 기존 아이템은 기존 anchor/fitWidth를 그대로 사용한다. 저장 인덱스·상품 가격·소유권은 별도 카탈로그 작업이다.

## 스카프 검증 리소스

- 원본: `Resources/Karakusa_Bandana_Fitted_Prototype.png` (기존 승인 이미지 그대로 재사용, 이번 작업에서 새 이미지 생성 없음)
- 부착선: back=(250,330), front=(1130,410), canvas=1536×1024
- 자동 맞춤 비교: `Resources/Karakusa_Bandana_Auto_Fit_Comparison.png`
- 걷기 비교: `Resources/Karakusa_Bandana_Auto_Fit_Walk.png`

스카프는 현재 **착용 검증용**이며 상점 상품/기본 지급 아이템으로 추가하지 않았다. 구매·서버 저장 작업 없이 임의 소유권을 부여하지 않는다.

## 다음 아이템도 같은 화면에서 확인

`npm run dev` 실행 후 `/tools/attachment-fit.html`에서 세 펫을 함께 확인한다. 실제 로더·AnimalAnimationController·공통 맞춤 함수를 사용하며 동작, 프레임 슬라이더, 좌우 방향, 부착선 표시를 제공한다. 도구의 텍스트도 게임 Jua 폰트를 사용한다. 도구는 일반 Vite 빌드에 포함되지 않는다.

검증: 기존 장착을 포함한 animal 테스트 112개 통과, 타입 검사·빌드 통과. 새 테스트는 이미지 여백에 독립적인 부착선 정합, 세 펫 전체 목 프레임·몸 배율·양방향, 회전 기준 보정, 미보정 펫/잘못된 데이터 처리를 확인한다. 육안으로 세 펫의 idle/walk/run/jump/attack/emote 대표 프레임을 확인했다. 모든 프레임의 육안 검증이나 털 뒤 가림 처리를 완료했다는 의미는 아니다. 몸에 감기는 입체 표현이나 자세별 가림은 별도 작업이다.
