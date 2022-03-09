npm run test &&
npm run compile &&
git add lib &&
git commit -m \"updated binaries\" &&
git branch --show-current | 
xargs -i git push -u origin {} &&
npm version $type