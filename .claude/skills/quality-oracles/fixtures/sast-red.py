import os
def run(cmd):
    os.system("ping " + cmd)
    eval(cmd)
