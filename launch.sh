#!/bin/bash
# Launch 5 Claude Code instances in separate Terminal tabs
# Each tab works on its own task file

PROJECT_DIR="/Users/angelafelicia/VSC/kip"

TASKS=(
  "task-1-browser-and-env"
  "task-2-provider-registry"
  "task-3-openrouter-provider"
  "task-4-supabase-provider"
  "task-5-cli-entrypoint"
)

for i in 0 1 2 3 4; do
  TAB=$((i + 1))
  TASK="${TASKS[$i]}"

  if [ $i -eq 0 ]; then
    osascript -e "
      tell application \"Terminal\"
        activate
        do script \"cd $PROJECT_DIR && echo '=== TAB $TAB: $TASK ===' && claude 'Read tasks/${TASK}.md and complete every step in it. When done, run the notification command at the bottom of the task file.'\"
      end tell
    "
  else
    osascript -e "
      tell application \"Terminal\"
        activate
        tell application \"System Events\" to keystroke \"t\" using {command down}
        delay 0.8
        do script \"cd $PROJECT_DIR && echo '=== TAB $TAB: $TASK ===' && claude 'Read tasks/${TASK}.md and complete every step in it. When done, run the notification command at the bottom of the task file.'\" in front window
      end tell
    "
  fi

  sleep 1
done

osascript -e 'display notification "5 Claude instances launched" with title "Autoprovision"'
echo "Launched 5 Claude tabs. Watch for macOS notifications when each finishes."
