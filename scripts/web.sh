cd workbench/_web
bun install
if [ "$1" = "--local" ]; then
    rm -rf node_modules/nnsightful && ln -s ../../../../nnsightful node_modules/nnsightful
    echo "Using local nnsightful"
fi
bun run dev
