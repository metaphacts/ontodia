#!/usr/bin/env sh

# automatic exit from shell on unhandled error
set -e
set -o xtrace

# get latest heroku build
echo \
'machine git.heroku.com
   login '$HEROKU_API_USER'
   password '$HEROKU_API_KEY'
machine api.heroku.com
  login '$HEROKU_API_USER'
  password '$HEROKU_API_KEY'
' > ~/.netrc

git config --global user.email "travis-build@ontodia.org"
git config --global user.name "Travis CI"

git clone https://git.heroku.com/library-ontodia-org.git "$TRAVIS_BUILD_DIR"/heroku-app
cd "$TRAVIS_BUILD_DIR"/heroku-app

# rewrite current build under assets. $TRAVIS_BRANCH will hold either branch name or tag name.
[ -e assets/"$TRAVIS_BRANCH" ] && rm -r assets/"$TRAVIS_BRANCH"
cp -r "$TRAVIS_BUILD_DIR"/dist assets/"$TRAVIS_BRANCH"
# remove temporary files
rm -r assets/"$TRAVIS_BRANCH"/temp

# push it back
git add assets
git commit -am "Travis update for $TRAVIS_BRANCH"
git push origin master
