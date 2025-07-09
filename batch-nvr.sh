#!/usr/bin/env bash

# 1) conda 셸 hook 불러오기
eval "$(conda shell.bash hook)"

# 2) 환경 활성화
conda activate beni
cd bin
# 3) nohup 백그라운드 실행
nohup python ./videoDataReceiver.py > /data/nvr/receive.log 2>&1 &
nohup python ./videoAlertCheck.py   > /data/nvr/alert.log   2>&1 &

