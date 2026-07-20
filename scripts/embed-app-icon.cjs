// electron-builder afterPack 훅: 앱 실행 파일에 브랜드 아이콘을 직접 심는다.
//
// 이 프로젝트는 win.signAndEditExecutable=false 로 두고 있다. electron-builder 의
// 기본 exe 편집 경로는 winCodeSign 도구 압축 해제 과정에서 심볼릭 링크 생성 권한
// (관리자/개발자 모드)이 필요해 이 머신에서 실패하기 때문이다. 그 대신 여기서
// rcedit(권한 불필요)로 아이콘과 제품명 메타데이터만 임베드한다.
const path = require('node:path');
const { rcedit } = require('rcedit');

exports.default = async function embedAppIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  const iconPath = path.resolve(
    __dirname,
    '..',
    'apps/desktop-electron/resources/wishfigure-icon.ico',
  );

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: context.packager.appInfo.productName,
      FileDescription: context.packager.appInfo.productName,
    },
    'product-version': context.packager.appInfo.version,
    'file-version': context.packager.appInfo.version,
  });

  console.log(`[embed-app-icon] icon embedded: ${exePath}`);
};
