# 더미 플레이

- Play → 평지 코스 → Victory 1.5초 → 페이드아웃 0.4초 → 로비 페이드인 0.4초.
- 240px/s, 출발 120px·도착 2520px: 기본 속도로 10초. 대시 사용 시 단축.
- 좌측 하단 조이스틱, 우측 하단 Attack/Dash/Jump 원형 버튼(Jump 크게), 우측 상단 Settings 원형 더미.
- PC: 방향키 또는 A/D 이동, Space/W/위쪽 방향키 점프, Shift 대시, J 공격.
- 게임 이동은 Run, 공격은 Attack, 대시는 Skill 프레임을 재생한다. 적·데미지·충돌 상호작용은 미구현.
- Settings 기능 없음. 복귀 후 코기는 자율 생활하며 첫 환영 연출은 생략.
- 입력은 포인터 캡처 및 멀티터치 지원. 세로에서 CSS로 회전한 화면에서는 조이스틱 축도 변환. 포커스 이탈/화면 전환 시 입력 초기화.
- 씬 종료 시 입력 리스너와 HTML UI 정리. 코기 텍스처는 재사용.
- 검증: 코스 10초, 완주 이후 이동 차단, 점프/착지, 대시 쿨다운, 공격 종료, Play→완주→복귀와 UI 정리 포함 테스트 21개 및 타입 검사/빌드 통과.
- 실기기 터치 및 브라우저 렌더링의 시각 확인은 별도 필요.
## Run / Attack / Skill 및 발바닥 버튼 배치

- Jump를 아래 중앙에 크게, Attack/Dash를 위 양옆에 작게 배치한다.
- 로비 Walk 유지. 게임 이동 Run, 상승 Jump → 하강 Fall → 착지 Land. Fall/Land는 기존 점프 시트의 포즈를 재사용한다.
- 공중 대시 불가(점프 직후 첫 프레임도 차단). 공중 공격 가능하며 중력/점프 궤적을 유지한다.
- 대시 중 점프·공격 취소 불가. 공격 연타로 동작 타이머를 초기화하지 않으며, 공격 중 대시는 막는다.
- Attack 0.48초, Skill 대시 0.32초. 해당 시간에 8개 프레임을 한 차례 재생한다.
- 새 아틀라스: public/assets/characters/corgi/corgi-run-attack-skill.png
- 좌표: public/assets/characters/corgi/combat-frames.json (2048×768, 8열×3행).
- 원본 이미지는 변경하지 않았다. built-in image_gen으로 Resources/Corgi_Art_Sheet.png를 참고해 투명 게임용 시트로 재구성했다. 원본 포즈의 픽셀 단위 직접 추출은 아니다.
- 생성 결과의 RGBA 및 알파 경계를 분석해 프레임 좌표를 정리했다.
- 테스트: 공중 대시 차단, 공중 공격 궤적 유지, 대시 취소 차단, 게임 Run/로비 Walk 구분, 액션 프레임/아틀라스 범위 검증 포함. 모바일 렌더링과 터치는 실기기 확인 필요.

### 생성 프롬프트 (built-in image_gen)

Prepare a runtime sprite atlas from this exact corgi reference. Preserve orange-and-white corgi identity, proportions, detailed soft pixel illustration, side-facing RIGHT. Extract/adapt RUN, ATTACK, SKILL action panels into exactly THREE horizontal rows of EIGHT equally spaced frames each. Row1 RUN: a coherent looping bounding run cycle, clearly running not walking. Row2 ATTACK: anticipation, playful paw swipe with small white crescent, followthrough, recovery, eight chronological poses. Row3 SKILL: low forward dash, launch stretch with tiny dust trail then recovery, eight chronological poses. Same character scale, isolated full-body silhouettes, paws on same baseline in each cell, ample padding. Uniform 8 columns x3 rows, landscape canvas. True transparent background. Remove dark background, labels, dividers, ground shadows. No other actions, no text. Must keep complete ears paws and all effects within each cell. All frames same body size and facing right.