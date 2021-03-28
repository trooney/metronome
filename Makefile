BUILD_PATH="./dist"

clean:
	@rm -rf $(BUILD_PATH)

build:
	@gulp build
	@env echo "Building binary..."

deploy:
	@ansible-playbook ansible/server.yml -i ansible/inventories/hosts.ini --ask-become-pass
	@env echo "Done!"
