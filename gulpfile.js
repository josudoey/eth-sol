const path = require("path");
const globby = require('globby')
const gulp = require("gulp");
const gutil = require('gulp-util');

const solPath = "./sol";
const outputPath = "./contract"
const child_process = require('child_process')
gulp.task("build", function () {
  const paths = globby.sync(solPath + '/**/*.sol', {
    cwd: __dirname,
    absolute: false,
    nodir: true
  })
  const flag = `--overwrite --optimize --abi --bin -o ${outputPath}`
  const exec = 'solc'
  const cmd = `${exec} ${flag} ${paths.join(" ")}`
  gutil.log(cmd)
  child_process.spawnSync(cmd, {
    shell: true,
    stdio: ['ignore', process.stdout, process.stderr]
  })

});

