#!/bin/bash
# Dorj Agent deb after-install.

if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Ensure the Electron binary wrapper stays executable.
chmod 0755 '/opt/${sanitizedProductName}/${executable}' 2>/dev/null || true
chmod 0755 '/opt/${sanitizedProductName}/${executable}.bin' 2>/dev/null || true

# Refresh icon theme so Dorj Agent logo shows in the Applications menu.
if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi
if hash xdg-icon-resource 2>/dev/null; then
    # Best-effort register a 48px pixmap fallback for older menus.
    if [ -f '/usr/share/icons/hicolor/48x48/apps/${executable}.png' ]; then
        xdg-icon-resource install --novendor --size 48 \
          '/usr/share/icons/hicolor/48x48/apps/${executable}.png' '${executable}' 2>/dev/null || true
    fi
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if [ -f "$APPARMOR_PROFILE_SOURCE" ] && apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET" || true
    fi
  fi
fi
