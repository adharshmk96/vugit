build: build-linux build-windows

build-linux:
	@GOOS=linux GOARCH=amd64 go build -o ./out/linux/vugit .

build-windows:
	@GOOS=windows GOARCH=amd64 go build -o ./out/win64/vugit.exe .

test:
	@go test ./...

coverage:
	@go test -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out

clean-branch:
	@git branch --merged | egrep -v "(^\*|master|main|dev)" | xargs git branch -d
