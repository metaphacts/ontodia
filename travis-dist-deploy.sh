#!/usr/bin/env sh
#get latest heroku build

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

git clone https://git.heroku.com/library-ontodia-org.git $TRAVIS_BUILD_DIR/heroku-app
cd $TRAVIS_BUILD_DIR/heroku-app

#append/rewrite current build under assets. $TRAVIS_BRANCH will hold either branch name or tag name.

mkdir -p assets/$TRAVIS_BRANCH
cp $TRAVIS_BUILD_DIR/dist/* assets/$TRAVIS_BRANCH

#push it back

git add assets
git commit -am "Travis update for $TRAVIS_BRANCH"
git push origin master
