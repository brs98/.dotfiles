#!/bin/sh

### START-OF-ICON-MAP
function __icon_map() {
    case "$1" in
    "App Store")
        icon_result=":app_store:"
        ;;
    "Arc")
        icon_result=":arc:"
        ;;
    "Battle.net")
        icon_result=":battle_net:"
        ;;
    "Calculator" | "Calculette")
        icon_result=":calculator:"
        ;;
    "Calendar" | "日历" | "Fantastical" | "Cron" | "Amie" | "Calendrier" | "Notion Calendar")
        icon_result=":calendar:"
        ;;
    "Color Picker" | "数码测色计")
        icon_result=":color_picker:"
        ;;
    "Default")
        icon_result=":default:"
        ;;
    "Discord" | "Discord Canary" | "Discord PTB")
        icon_result=":discord:"
        ;;
    "Docker" | "Docker Desktop")
        icon_result=":docker:"
        ;;
    "FaceTime" | "FaceTime 通话")
        icon_result=":face_time:"
        ;;
    "Figma")
        icon_result=":figma:"
        ;;
    "Finder" | "访达")
        icon_result=":finder:"
        ;;
    "Firefox")
        icon_result=":firefox:"
        ;;
    "Firefox Developer Edition" | "Firefox Nightly")
        icon_result=":firefox_developer_edition:"
        ;;
    "System Preferences" | "System Settings" | "系统设置" | "Réglages Système")
        icon_result=":gear:"
        ;;
    "GitHub Desktop")
        icon_result=":git_hub:"
        ;;
    "Godot")
        icon_result=":godot:"
        ;;
    "Chromium" | "Google Chrome" | "Google Chrome Canary")
        icon_result=":google_chrome:"
        ;;
    "Home Assistant")
        icon_result=":home_assistant:"
        ;;
    "kitty")
        icon_result=":terminal:"
        ;;
    "Linear")
        icon_result=":linear:"
        ;;
    "Canary Mail" | "HEY" | "Mail" | "Mailspring" | "MailMate" | "Superhuman" | "Spark" | "邮件")
        icon_result=":mail:"
        ;;
    "Maps" | "Google Maps")
        icon_result=":maps:"
        ;;
    "Messages" | "信息" | "Nachrichten")
        icon_result=":messages:"
        ;;
    "Music" | "音乐" | "Musique")
        icon_result=":music:"
        ;;
    "Neovim" | "neovim" | "nvim")
        icon_result=":neovim:"
        ;;
    "Notes" | "备忘录")
        icon_result=":notes:"
        ;;
    "Notion")
        icon_result=":notion:"
        ;;
    "Obsidian")
        icon_result=":obsidian:"
        ;;
    "OBS")
        icon_result=":obsstudio:"
        ;;
    "1Password")
        icon_result=":one_password:"
        ;;
    "ChatGPT")
        icon_result=":openai:"
        ;;
    "Preview" | "预览" | "Skim" | "zathura" | "Aperçu")
        icon_result=":pdf:"
        ;;
    "Postman")
        icon_result=":postman:"
        ;;
    "Reminders" | "提醒事项" | "Rappels")
        icon_result=":reminders:"
        ;;
    "Safari" | "Safari浏览器" | "Safari Technology Preview")
        icon_result=":safari:"
        ;;
    "Slack")
        icon_result=":slack:"
        ;;
    "Spotify")
        icon_result=":spotify:"
        ;;
    "Spotlight")
        icon_result=":spotlight:"
        ;;
    "Terminal" | "终端")
        icon_result=":terminal:"
        ;;
    "Xcode")
        icon_result=":xcode:"
        ;;
    "Zed")
        icon_result=":zed:"
        ;;
    "zoom.us")
        icon_result=":zoom:"
        ;;
    *)
        icon_result=":default:"
        ;;
    esac
}
### END-OF-ICON-MAP

if [ "$SENDER" = "front_app_switched" ]; then
    __icon_map "$INFO"
    sketchybar --set app_icon icon="$icon_result"
fi
