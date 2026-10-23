# 로비 아이콘 — 사용자 승인·적용 기준 (2026-10-24)

- 사용자 승인: 단순 동물 기호 대신 기존 턱시도 고양이와 명랑이 얼굴을 활용한 시안을 로비에 적용한다. 캐릭터 버튼은 보라색 발바닥만 사용한다.
- 참조: Resources/Cat_Tuxedo_Action_Art_Sheet.png의 정면 DIRECTION 얼굴, Resources/PawHaven_Myeongrang_Icon.png.
- 제작: imagegen 스킬의 built-in image_gen 편집. 원본 픽셀을 그대로 잘라 붙인 결과가 아니라, 두 리소스를 참조해 합성한 파생 이미지다. 생성 결과의 투명도를 유지해 Resources/Lobby_Friends_Myeongrang_Cat.png로 보관한다. 원본 리소스는 보존했다. 이후 작업에서는 이 승인 PNG를 재사용한다.
- 명랑이는 앞·좌측, 고양이는 뒤·우측에 배치한다. 귀·눈·코를 가리지 않고 작은 버튼에서도 두 얼굴을 읽을 수 있게 한다. 바탕은 기존 96격자 시안, 캐릭터 발바닥과 다른 버튼은 유지한다.
- 캐릭터/바탕: Resources/Lobby_Character_Paw.svg는 기존 Control_Attack.svg의 발바닥을 보라색으로 바꾼 64격자 리소스다. Resources/Lobby_Button_Face.svg는 승인된 조작 UI 방식의 96격자 크림색 바탕이다.
- 배포: public/assets/icons/lobby-character.svg, lobby-friends.png, lobby-button-face.svg. 원본과 바이트를 일치시킨다. LobbyHud가 해당 파일을 사용하고 CSS에서 두 버튼만 픽셀 바탕을 적용한다. 친구 얼굴은 바탕 안에서 크게 보이도록 padding .35cqw를 사용한다.
- 정리: 비교판 HTML/PNG, 단순 얼굴 SVG, 임시 생성 스크립트는 삭제했다. 다음에는 임시 시안을 다시 생성하지 말고 위 정식 원본을 사용한다. 전체 UI 기억은 [UI_STYLE.md](UI_STYLE.md)의 최상단 절을 따른다.
- 적용 검증: 동물·로비 관련 기존 84개 테스트, 타입 검사 및 프로덕션 빌드 통과. Chrome headless에서 1280×720·800×540 실제 LobbyHud의 새 이미지 로드·픽셀 바탕·요청 배지·화면 경계 포함을 확인했다. 채택 원본 3개와 배포 사본은 SHA-256이 일치한다. 임시 확인 HTML은 삭제했다.

## 최종 생성 프롬프트

Create ONE transparent game UI icon asset by compositing the faces of the two provided existing game characters. Reference 1 is the existing black and white tuxedo CAT action sheet: use the front-facing cat face in the bottom-left DIRECTION section, retaining black pointed ears with pink inner ears, amber eyes, white muzzle and the same sweet expression. Reference 2 is MYEONGRANG's approved pixel-art portrait: preserve this specific dog's large upright cinnamon ears, orange-brown fur, white cheeks and muzzle, large glossy dark eyes, black nose and small smiling mouth. Use the actual reference character appearances, NOT generic animal pictograms. Show HEADS ONLY with ears complete, little or no neck, no bodies/paws. Myeongrang in the foreground LEFT, cat slightly behind on the RIGHT. Both faces large and readable with a modest overlap; do not obscure either animal's eyes or ears. Compose them compactly into a roughly square icon silhouette, with the heads filling most of the asset and a little transparent breathing room. Keep the finely resolved 2D PIXEL ART character texture of reference 2 and the source game sprites, restrained warm highlights and crisp fine pixel contours; NO smooth vector look, NO coarse enlarged mosaic, NO 3D or glossy molded icon style. Remove original sheet background, yellow background, all frames, labels and text. Transparent background; NO button face, circular frame, text, shadow plate or surrounding UI. This is a reusable two-pet friendship icon, a faithful reuse of existing characters.
