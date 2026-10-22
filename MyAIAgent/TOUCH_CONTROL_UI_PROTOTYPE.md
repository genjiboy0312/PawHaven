# 인게임 조작 버튼 이미지 시안

## 최신 방향: v3 (2D, Attack 발바닥만)
- 사용자 수정: v1의 3D 표현은 게임·가구와 어울리지 않는다. 이후 조작 UI는 평면적인 2D와 픽셀 캐릭터에 맞춘 단순한 색면·외곽선을 우선한다. 두꺼운 베벨·광택·입체 테두리는 제외한다.
- `Resources/Touch_Controls_UI_Prototype_v2.png`: 입체감을 줄인 2D 수정안.
- `Resources/Touch_Controls_UI_Prototype_v3.png`: 최신 수정안. Attack은 할퀴기 줄무늬 없이 발바닥 패드와 발가락 네 개만 표시한다. 나머지 배치·Dash/Jump·쿨다운 상태 예시는 유지한다.
- 두 이미지 모두 내장 imagegen으로 수정하고 Resources에 PNG 원본을 복사했다. 승인된 v3 디자인은 SVG 아이콘·CSS 색면으로 인게임에 적용했다. 실제 사용 아이콘은 Resources/Control_Attack.svg, Control_Dash.svg, Control_Jump.svg에 보관하며 public/assets/controls의 동일 파일을 사용한다. 적용 상세: [TOUCH_UI_APPLIED.md](TOUCH_UI_APPLIED.md).

## 이전 v1 기록

- 요청: 사용자 제공 Party Animals 화면의 따뜻한 색감·둥근 형태·부드러운 입체감을 참고한 조작 버튼 프로토타입.
- 이미지: `Resources/Touch_Controls_UI_Prototype_v1.png`. 게임 적용 전 디자인 검토용이며 하나의 시안 이미지다.
- 제작: imagegen 내장 이미지 생성 1회. 원본은 생성 폴더에 보존하고 Resources에 동일 PNG를 복사했다.
- 배치: 왼쪽 원형 조이스틱, 오른쪽 위 Attack/Dash 두 개와 아래 중앙의 더 큰 Jump로 발바닥 형태 구성.
- 표면: 버터·크림색 무광, 두꺼운 둥근 테두리, 위쪽의 넓고 부드러운 하이라이트, 낮은 베이지 그림자. 단순한 아이콘과 둥근 진갈색 글자.
- 구분: Attack은 살구색 바탕과 테라코타 발바닥/할퀴기, Dash는 옅은 세이지색 바탕과 이중 화살표, Jump는 버터색 바탕과 위 화살표.
- 상태: Dash의 Ready / Cooldown / Unavailable 비교. 쿨다운은 테두리의 호박색 진행 원호, 사용 불가는 채도·명도 완화. 시안 속 0.4s는 표시 예시이며 실제 쿨다운 값을 바꾸는 기획이 아니다.
- 재사용 방향: 승인 후 기존 원형 버튼·조이스틱 동작과 게임 상태를 유지하며 CSS와 단순 아이콘으로 구현 가능한 수준으로 정리한다. 이 이미지는 통째로 HUD에 붙이는 아틀라스가 아니다.
- 생성 요약: landscape 16:9 cozy game touch control concept sheet, warm pale ivory background, soft molded matte toy-like circular controls, cream rims, shallow warm shadows, large left joystick, Attack/Dash above a larger Jump, small three-state Dash samples, no character or copied game logo.
