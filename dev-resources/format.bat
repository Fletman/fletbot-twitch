@echo off
for /f %%m in ('dir /s/b modules\\*.js') do call js-beautify --config "dev-resources/format.json" -r %%m
for /f %%w in ('dir /s/b workers\\*.js') do call js-beautify --config "dev-resources/format.json" -r %%w
call js-beautify --config "dev-resources/format.json" -r index.js
